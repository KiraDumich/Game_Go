import Phaser from 'phaser';
import { findCar } from './cars';
import { LEVELS, type LevelConfig } from './levels';
import {
  TRAFFIC_COLORS,
  carTextureKey,
  makeFinishTexture,
  makeRoadTexture,
  makeSpriteTextures,
} from './pixelArt';

// --- Трасса ---
const ROAD_WIDTH = 480;
const LANE_COUNT = 4;

// --- Игрок ---
const PLAYER_Y_FROM_BOTTOM = 110; // машина игрока стоит внизу экрана
const ACCELERATION = 260; // px/с² при нажатой ↑
const BRAKE = 520; // px/с² при нажатой ↓
const COAST_SLOWDOWN = 90; // px/с², если газ отпущен
const STEER_SPEED = 300; // px/с влево-вправо
const STEER_TILT_DEG = 10; // наклон машины при повороте
const SPEED_TO_KMH = 0.4; // перевод скорости в «км/ч» для HUD

// --- Нитро (Space) ---
const NITRO_DURATION_MS = 1500;
const NITRO_COOLDOWN_MS = 5000;
const NITRO_SPEED_BONUS = 1.35; // во сколько раз растёт предел скорости
const NITRO_ACCELERATION = 700;

// --- Столкновения ---
const START_LIVES = 3;
const INVULNERABLE_MS = 1500;
const CRASH_SPEED_FACTOR = 0.3; // после удара остаётся 30% скорости
const HITBOX_SCALE = 0.75; // хитбокс чуть меньше спрайта, чтобы было честно

// --- Препятствия ---
const SPAWN_Y = -80;
const FREE_LANE_ZONE_Y = 120; // полоса считается занятой, если там есть препятствие выше этой линии
const DESPAWN_MARGIN = 200;

const COUNTDOWN_MS = 3000;

type Obstacle = {
  sprite: Phaser.GameObjects.Image;
  speed: number; // своя скорость вперёд; 0 — конус, < 0 — встречная машина
};

type RaceState = 'countdown' | 'racing' | 'crashed' | 'finished';

type SceneData = {
  levelIndex?: number;
  totalTime?: number; // время прошлых уровней, мс
};

const FONT = { fontFamily: '"Courier New", monospace', fontStyle: 'bold' };

/**
 * «Пиксельные гонки»: вид сверху, едем по трассе и объезжаем конусы и машины.
 * ↑ — газ, ↓ — тормоз, ←/→ — руль, Space — нитро.
 * 2 уровня, 3 жизни на уровень, R — заново, M — гараж (выбор машины).
 */
export class GameScene extends Phaser.Scene {
  private level!: LevelConfig;
  private levelIndex = 0;
  private totalTime = 0;
  private bestTimes: number[] = [];

  private road!: Phaser.GameObjects.TileSprite;
  private player!: Phaser.GameObjects.Image;
  private finishLine?: Phaser.GameObjects.Image;
  private obstacles: Obstacle[] = [];

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private nitroKey!: Phaser.Input.Keyboard.Key;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private nextKey!: Phaser.Input.Keyboard.Key;
  private garageKey!: Phaser.Input.Keyboard.Key;

  private timeText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private nitroText!: Phaser.GameObjects.Text;
  private progressMarker!: Phaser.GameObjects.Rectangle;
  private centerText!: Phaser.GameObjects.Text;

  private state: RaceState = 'countdown';
  private raceStartAt = 0;
  private raceTime = 0;
  private speed = 0;
  private distance = 0;
  private distanceSinceSpawn = 0;
  private lives = START_LIVES;
  private invulnerableUntil = 0;
  private nitroUntil = 0;
  private nitroReadyAt = 0;

  constructor() {
    super('GameScene');
  }

  private get roadLeft(): number {
    return (this.scale.width - ROAD_WIDTH) / 2;
  }

  private get laneWidth(): number {
    return ROAD_WIDTH / LANE_COUNT;
  }

  create(data: SceneData): void {
    // create() вызывается и при scene.restart(), поэтому сбрасываем состояние здесь
    this.levelIndex = data.levelIndex ?? 0;
    this.totalTime = data.totalTime ?? 0;
    this.level = LEVELS[this.levelIndex] ?? LEVELS[0]!;
    this.obstacles = [];
    this.finishLine = undefined;
    this.state = 'countdown';
    this.raceStartAt = this.time.now + COUNTDOWN_MS;
    this.raceTime = 0;
    this.speed = 0;
    this.distance = 0;
    this.distanceSinceSpawn = 0;
    this.lives = START_LIVES;
    this.invulnerableUntil = 0;
    this.nitroUntil = 0;
    this.nitroReadyAt = 0;

    this.createTextures();
    this.createWorld();
    this.createHud();
    this.createInput();
  }

  update(time: number, delta: number): void {
    if (this.state === 'crashed') {
      if (Phaser.Input.Keyboard.JustDown(this.restartKey)) this.restartLevel(this.levelIndex);
      else if (Phaser.Input.Keyboard.JustDown(this.garageKey)) this.scene.start('ShopScene');
      return;
    }

    if (this.state === 'finished') {
      this.handleFinishedInput();
      return;
    }

    if (this.state === 'countdown') {
      this.updateCountdown(time);
      return;
    }

    const seconds = delta / 1000;
    this.raceTime += delta;
    this.updateSpeed(time, seconds);
    this.steer(seconds);
    this.scrollWorld(seconds);
    this.spawnObstacles();
    this.checkCollisions(time);
    this.checkFinish();
    this.updatePlayerLook(time);
    this.updateHud(time);
  }

  // --- Создание сцены ---

  private createTextures(): void {
    makeSpriteTextures(this);
    makeFinishTexture(this, ROAD_WIDTH);
    makeRoadTexture(
      this,
      this.roadTextureKey(),
      this.level.theme,
      this.scale.width,
      this.roadLeft,
      ROAD_WIDTH,
      LANE_COUNT,
    );
  }

  private roadTextureKey(): string {
    return `road-${this.levelIndex}`;
  }

  private createWorld(): void {
    const { width, height } = this.scale;
    this.road = this.add.tileSprite(0, 0, width, height, this.roadTextureKey()).setOrigin(0, 0);

    // машина, выбранная в гараже (ShopScene)
    const car = findCar(this.registry.get('carId') as string | undefined);
    this.player = this.add
      .image(this.laneCenter(1), height - PLAYER_Y_FROM_BOTTOM, car.topKey)
      .setScale(car.topScale)
      .setDepth(3);
  }

  private createHud(): void {
    const { width, height } = this.scale;
    const small = { ...FONT, fontSize: '18px', color: '#ffffff', stroke: '#1a1c2c', strokeThickness: 4 };
    const big = { ...small, fontSize: '22px' };

    const leftX = 16;
    this.add.text(leftX, 16, this.level.name.replace(' — ', '\n'), small).setDepth(10);
    this.timeText = this.add.text(leftX, 80, '', big).setDepth(10);
    this.add
      .text(leftX, height - 64, '↑ газ  ↓ тормоз\n←→ руль  Space нитро', { ...small, fontSize: '14px' })
      .setDepth(10);

    const rightX = width - 16;
    this.speedText = this.add.text(rightX, 16, '', big).setOrigin(1, 0).setDepth(10);
    this.livesText = this.add.text(rightX, 52, '', { ...big, color: '#ff4d4d' }).setOrigin(1, 0).setDepth(10);
    this.nitroText = this.add.text(rightX, 88, '', small).setOrigin(1, 0).setDepth(10);

    // полоса прогресса до финиша справа
    const barX = width - 40;
    const barTop = 150;
    const barBottom = height - 40;
    this.add.rectangle(barX, barTop, 8, barBottom - barTop, 0x1a1c2c).setOrigin(0.5, 0).setDepth(10);
    this.add.rectangle(barX, barTop, 24, 6, 0xffffff).setDepth(10);
    this.progressMarker = this.add.rectangle(barX, barBottom, 20, 12, 0xe43b44).setDepth(11);
    this.progressMarker.setData('top', barTop).setData('bottom', barBottom);

    this.centerText = this.add
      .text(width / 2, height / 2 - 40, '', {
        ...FONT,
        fontSize: '30px',
        color: '#ffffff',
        align: 'center',
        backgroundColor: '#1a1c2ccc',
        padding: { x: 24, y: 16 },
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.updateHud(this.time.now);
  }

  private createInput(): void {
    if (!this.input.keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
    this.nitroKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.nextKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.garageKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
  }

  // --- Старт ---

  private updateCountdown(time: number): void {
    const left = this.raceStartAt - time;
    if (left > 0) {
      this.centerText.setText(`${this.level.name}\n\n${Math.ceil(left / 1000)}`).setVisible(true);
      return;
    }

    this.state = 'racing';
    this.centerText.setVisible(false);
    this.showPopup(this.scale.width / 2, this.scale.height / 2, 'GO!', '#63c74d');
  }

  // --- Игрок ---

  private isDown(dir: 'up' | 'down' | 'left' | 'right'): boolean {
    return this.cursors[dir].isDown || this.wasd[dir].isDown;
  }

  private updateSpeed(time: number, seconds: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.nitroKey) && time >= this.nitroReadyAt) {
      this.nitroUntil = time + NITRO_DURATION_MS;
      this.nitroReadyAt = time + NITRO_COOLDOWN_MS;
      this.showPopup(this.player.x, this.player.y - 50, 'НИТРО!', '#94e2ff');
    }

    const hasNitro = time < this.nitroUntil;
    const maxSpeed = hasNitro ? this.level.maxSpeed * NITRO_SPEED_BONUS : this.level.maxSpeed;

    if (hasNitro) this.speed += NITRO_ACCELERATION * seconds;
    else if (this.isDown('up')) this.speed += ACCELERATION * seconds;
    else if (this.isDown('down')) this.speed -= BRAKE * seconds;
    else this.speed -= COAST_SLOWDOWN * seconds;

    // после нитро скорость плавно возвращается к обычному пределу
    if (this.speed > maxSpeed) this.speed = Math.max(maxSpeed, this.speed - BRAKE * seconds);
    this.speed = Math.max(0, this.speed);
  }

  private steer(seconds: number): void {
    let dx = 0;
    if (this.isDown('left')) dx -= 1;
    if (this.isDown('right')) dx += 1;

    this.player.x += dx * STEER_SPEED * seconds;
    this.player.angle = dx * STEER_TILT_DEG;

    const half = this.player.displayWidth / 2;
    this.player.x = Phaser.Math.Clamp(this.player.x, this.roadLeft + half, this.roadLeft + ROAD_WIDTH - half);
  }

  private updatePlayerLook(time: number): void {
    const isInvulnerable = time < this.invulnerableUntil;
    // мигание после удара
    this.player.setAlpha(isInvulnerable && Math.floor(time / 100) % 2 === 0 ? 0.3 : 1);
  }

  // --- Мир: прокрутка и препятствия ---

  private scrollWorld(seconds: number): void {
    const step = this.speed * seconds;
    this.distance += step;
    this.distanceSinceSpawn += step;
    this.road.tilePositionY -= step;

    if (this.finishLine) this.finishLine.y += step;

    const { height } = this.scale;
    for (const obstacle of this.obstacles) {
      obstacle.sprite.y += (this.speed - obstacle.speed) * seconds;
    }

    // убираем всё, что уехало за экран
    this.obstacles = this.obstacles.filter((obstacle) => {
      const y = obstacle.sprite.y;
      const isGone = y > height + DESPAWN_MARGIN || y < SPAWN_Y - DESPAWN_MARGIN;
      if (isGone) obstacle.sprite.destroy();
      return !isGone;
    });
  }

  private laneCenter(lane: number): number {
    return this.roadLeft + this.laneWidth * (lane + 0.5);
  }

  private isLaneFree(lane: number): boolean {
    const x = this.laneCenter(lane);
    return !this.obstacles.some(
      (obstacle) => Math.abs(obstacle.sprite.x - x) < this.laneWidth / 2 && obstacle.sprite.y < FREE_LANE_ZONE_Y,
    );
  }

  private spawnObstacles(): void {
    if (this.finishLine || this.distanceSinceSpawn < this.level.spawnGap) return;
    this.distanceSinceSpawn = 0;

    const lanes = Array.from({ length: LANE_COUNT }, (_, lane) => lane);
    const freeLanes = lanes.filter((lane) => this.isLaneFree(lane));
    if (freeLanes.length === 0) return;
    const lane = Phaser.Utils.Array.GetRandom(freeLanes);

    if (Math.random() < this.level.coneChance) this.spawnCone(lane);
    else this.spawnCar(lane);
  }

  private spawnCone(lane: number): void {
    // конус стоит не строго по центру полосы — так интереснее объезжать
    const offset = Phaser.Math.Between(-this.laneWidth / 4, this.laneWidth / 4);
    const sprite = this.add.image(this.laneCenter(lane) + offset, SPAWN_Y, 'cone').setDepth(2);
    this.obstacles.push({ sprite, speed: 0 });
  }

  private spawnCar(lane: number): void {
    const isOncoming = lane < this.level.oncomingLanes;
    const color = Phaser.Utils.Array.GetRandom(TRAFFIC_COLORS);
    const sprite = this.add
      .image(this.laneCenter(lane), SPAWN_Y, carTextureKey(color))
      .setDepth(2)
      .setFlipY(isOncoming);

    const speed = isOncoming
      ? -this.level.oncomingSpeed
      : Phaser.Math.Between(this.level.trafficMinSpeed, this.level.trafficMaxSpeed);
    this.obstacles.push({ sprite, speed });
  }

  // --- Столкновения ---

  private hitbox(sprite: Phaser.GameObjects.Image): Phaser.Geom.Rectangle {
    const w = sprite.displayWidth * HITBOX_SCALE;
    const h = sprite.displayHeight * HITBOX_SCALE;
    return new Phaser.Geom.Rectangle(sprite.x - w / 2, sprite.y - h / 2, w, h);
  }

  private checkCollisions(time: number): void {
    if (time < this.invulnerableUntil) return;

    const playerBox = this.hitbox(this.player);
    const hit = this.obstacles.find((obstacle) =>
      Phaser.Geom.Intersects.RectangleToRectangle(playerBox, this.hitbox(obstacle.sprite)),
    );
    if (!hit) return;

    this.lives -= 1;
    this.speed *= CRASH_SPEED_FACTOR;
    this.nitroUntil = 0;
    this.invulnerableUntil = time + INVULNERABLE_MS;
    this.cameras.main.shake(200, 0.012);
    this.cameras.main.flash(150, 228, 59, 68);
    this.showPopup(this.player.x, this.player.y - 50, 'БАМ! -1 ♥', '#ff4d4d');
    this.knockAway(hit);

    if (this.lives <= 0) this.crashOut();
  }

  /** Сбитое препятствие отлетает в сторону и исчезает. */
  private knockAway(obstacle: Obstacle): void {
    this.obstacles = this.obstacles.filter((other) => other !== obstacle);
    const side = obstacle.sprite.x < this.player.x ? -1 : 1;
    this.tweens.add({
      targets: obstacle.sprite,
      x: obstacle.sprite.x + side * 80,
      y: obstacle.sprite.y - 60,
      angle: side * 180,
      alpha: 0,
      duration: 400,
      onComplete: () => obstacle.sprite.destroy(),
    });
  }

  // --- Финиш и конец уровня ---

  private checkFinish(): void {
    if (!this.finishLine && this.distance >= this.level.length) {
      this.finishLine = this.add.image(this.scale.width / 2, SPAWN_Y, 'finish').setDepth(1);
    }

    if (this.finishLine && this.finishLine.y >= this.player.y) this.finishLevel();
  }

  private finishLevel(): void {
    this.state = 'finished';
    this.player.setAlpha(1).setAngle(0);

    const previousBest = this.bestTimes[this.levelIndex];
    const isRecord = previousBest === undefined || this.raceTime < previousBest;
    if (isRecord) this.bestTimes[this.levelIndex] = this.raceTime;
    this.totalTime += this.raceTime;

    const recordLine = isRecord ? 'НОВЫЙ РЕКОРД!' : `Рекорд: ${formatTime(previousBest)}`;
    const isLastLevel = this.levelIndex >= LEVELS.length - 1;

    if (isLastLevel) {
      this.centerText.setText(
        `ПОБЕДА!\n\nВремя уровня: ${formatTime(this.raceTime)}\n${recordLine}\n` +
          `Общее время: ${formatTime(this.totalTime)}\n\nR — сыграть снова   M — гараж`,
      );
    } else {
      this.centerText.setText(
        `ФИНИШ!\n\nВремя: ${formatTime(this.raceTime)}\n${recordLine}\n\nEnter — следующий уровень`,
      );
    }
    this.centerText.setVisible(true);
    this.updateHud(this.time.now);
  }

  private handleFinishedInput(): void {
    const isLastLevel = this.levelIndex >= LEVELS.length - 1;
    if (isLastLevel && Phaser.Input.Keyboard.JustDown(this.restartKey)) {
      this.restartLevel(0);
    } else if (isLastLevel && Phaser.Input.Keyboard.JustDown(this.garageKey)) {
      this.scene.start('ShopScene');
    } else if (!isLastLevel && Phaser.Input.Keyboard.JustDown(this.nextKey)) {
      this.scene.restart({ levelIndex: this.levelIndex + 1, totalTime: this.totalTime });
    }
  }

  private crashOut(): void {
    this.state = 'crashed';
    this.player.setAlpha(1).setAngle(0).setTint(0x5d5d5d);
    this.updateHud(this.time.now);
    this.centerText
      .setText(`АВАРИЯ!\n\nПроехано: ${Math.floor(this.progress() * 100)}%\n\nR — заново   M — гараж`)
      .setVisible(true);
  }

  private restartLevel(levelIndex: number): void {
    // при перезапуске уровня время прошлых уровней сохраняется, при новой игре — обнуляется
    const totalTime = levelIndex === 0 ? 0 : this.totalTime;
    this.scene.restart({ levelIndex, totalTime });
  }

  // --- Интерфейс ---

  private progress(): number {
    return Phaser.Math.Clamp(this.distance / this.level.length, 0, 1);
  }

  private updateHud(time: number): void {
    const best = this.bestTimes[this.levelIndex];
    this.timeText.setText(`Время ${formatTime(this.raceTime)}` + (best !== undefined ? `\nРекорд ${formatTime(best)}` : ''));
    this.speedText.setText(`${Math.round(this.speed * SPEED_TO_KMH)} км/ч`);
    this.livesText.setText('♥'.repeat(Math.max(this.lives, 0)));

    const cooldownLeft = Math.max(0, this.nitroReadyAt - time);
    this.nitroText.setText(cooldownLeft > 0 ? `Нитро ${(cooldownLeft / 1000).toFixed(1)}с` : 'Нитро готово');
    this.nitroText.setColor(cooldownLeft > 0 ? '#8b9bb4' : '#94e2ff');

    const top = this.progressMarker.getData('top') as number;
    const bottom = this.progressMarker.getData('bottom') as number;
    this.progressMarker.y = bottom - (bottom - top) * this.progress();
  }

  private showPopup(x: number, y: number, message: string, color: string): void {
    const text = this.add
      .text(x, y, message, { ...FONT, fontSize: '24px', color, stroke: '#1a1c2c', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(15);

    this.tweens.add({
      targets: text,
      y: y - 40,
      alpha: 0,
      duration: 800,
      onComplete: () => text.destroy(),
    });
  }
}

function formatTime(ms: number | undefined): string {
  if (ms === undefined) return '--';
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${seconds}`;
}
