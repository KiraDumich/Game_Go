import Phaser from 'phaser';
import { findCar } from './cars';
import { GAME_CONFIG } from './gameConfig';
import { LEVELS, PHASE_2_ROAD_TINT, withPhase2, type LevelConfig } from './levels';
import {
  TRAFFIC_COLORS,
  carTextureKey,
  makeFinishTexture,
  makeRoadTexture,
  makeSpriteTextures,
} from './pixelArt';
import { createRoadworksAnimations, loadRoadworksAssets, roadworksLayout } from './roadworks';

// --- Трасса ---
const ROAD_WIDTH = 480;
const LANE_COUNT = 4;

// Числа баланса (скорость, нитро, жизни, препятствия, фаза 2) — в gameConfig.ts.
// Здесь только раскладка экрана и технические значения.

// --- Игрок ---
const PLAYER_Y_FROM_BOTTOM = 110; // машина игрока стоит внизу экрана
const STEER_TILT_DEG = 10; // наклон машины при повороте
const SPEED_TO_KMH = 0.4; // перевод скорости в «км/ч» для HUD

// --- Препятствия ---
const SPAWN_Y = -80;
const FREE_LANE_ZONE_Y = 120; // полоса считается занятой, если там есть препятствие выше этой линии
const DESPAWN_MARGIN = 200;
const DETOUR_MS = 1200; // за сколько попутная машина перестраивается из перекрытой полосы

type ObstacleSprite = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;

type Obstacle = {
  sprite: ObstacleSprite;
  speed: number; // своя скорость вперёд; 0 — конус, < 0 — встречная машина
  fixed?: boolean; // тяжёлое (барьер, техника, рабочий): не отлетает от удара
  decor?: boolean; // только картинка (разрытый асфальт): не сталкивается
};

type RaceState = 'tutorial' | 'countdown' | 'racing' | 'paused' | 'crashed' | 'finished';

const TUTORIAL_ICON_SPACING = 150; // расстояние между картинками в подсказке, px

/** Данные забега, которые переживают переход между уровнями и рестарт сцены. */
export type RunData = {
  levelIndex: number;
  totalTime: number; // время прошлых уровней, мс
};

/** Начало новой игры: первый уровень, время с нуля. Используют гараж и рестарт после победы. */
export const NEW_RUN: RunData = { levelIndex: 0, totalTime: 0 };

const FONT = { fontFamily: '"Courier New", monospace', fontStyle: 'bold' };

/**
 * «Пиксельные гонки»: вид сверху, едем по трассе и объезжаем конусы и машины.
 * ↑ — газ, ↓ — тормоз, ←/→ — руль, Space — нитро, P — пауза.
 * 3 уровня (на 3-м — дорожные работы), 3 жизни на уровень, R — заново, M — гараж (выбор машины).
 */
export class GameScene extends Phaser.Scene {
  private level!: LevelConfig;
  private rules!: LevelConfig; // действующие правила: уровень, а с фазы 2 — с её поправками
  private phase: 1 | 2 = 1;
  private levelIndex = 0;
  private totalTime = 0;
  private bestTimes: number[] = [];
  private seenTutorials = new Set<number>(); // подсказка уровня показывается один раз за сессию

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
  private pauseKey!: Phaser.Input.Keyboard.Key;

  private timeText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private nitroText!: Phaser.GameObjects.Text;
  private progressMarker!: Phaser.GameObjects.Rectangle;
  private centerText!: Phaser.GameObjects.Text;
  private phaseBanner!: Phaser.GameObjects.Text;
  private pauseOverlay!: Phaser.GameObjects.Container;
  private tutorialPanel?: Phaser.GameObjects.Container;

  private state: RaceState = 'countdown';
  private raceStartAt = 0;
  private raceTime = 0;
  private speed = 0;
  private distance = 0;
  private distanceSinceSpawn = 0;
  private lives = GAME_CONFIG.startLives;
  private invulnerableUntil = 0;
  private nitroUntil = 0;
  private nitroReadyAt = 0;
  private pausedAt = 0; // момент, когда нажали паузу
  private stateBeforePause: RaceState = 'racing'; // куда вернуться после паузы
  private nextRoadworks = 0; // какой по счёту участок дорожных работ появится следующим
  private closedLane = -1; // полоса, перекрытая дорожными работами (-1 — нет)
  private closedLaneEnd?: ObstacleSprite; // последний барьер участка: пока он выше экрана, полоса закрыта

  constructor() {
    super('GameScene');
  }

  preload(): void {
    loadRoadworksAssets(this);
  }

  private get roadLeft(): number {
    return (this.scale.width - ROAD_WIDTH) / 2;
  }

  private get laneWidth(): number {
    return ROAD_WIDTH / LANE_COUNT;
  }

  create(data: Partial<RunData>): void {
    // create() вызывается и при scene.restart(), поэтому сбрасываем состояние здесь
    this.levelIndex = data.levelIndex ?? 0;
    this.totalTime = data.totalTime ?? 0;
    this.level = LEVELS[this.levelIndex] ?? LEVELS[0]!;
    this.rules = this.level;
    this.phase = 1; // каждый уровень начинается с фазы 1, с середины трассы — фаза 2
    this.obstacles = [];
    this.finishLine = undefined;
    this.state = 'countdown';
    this.raceStartAt = this.time.now + GAME_CONFIG.countdownMs;
    this.raceTime = 0;
    this.speed = 0;
    this.distance = 0;
    this.distanceSinceSpawn = 0;
    this.lives = GAME_CONFIG.startLives;
    this.invulnerableUntil = 0;
    this.nitroUntil = 0;
    this.nitroReadyAt = 0;
    this.nextRoadworks = 0;
    this.closedLane = -1;
    this.closedLaneEnd = undefined;
    this.tutorialPanel = undefined;

    this.createTextures();
    createRoadworksAnimations(this);
    this.createWorld();
    this.createHud();
    this.createInput();

    if (this.level.tutorial && !this.seenTutorials.has(this.levelIndex)) this.showTutorial();
  }

  update(time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.pauseKey)) this.togglePause(time);
    if (this.state === 'paused') return;

    if (this.state === 'tutorial') {
      this.handleTutorialInput(time);
      return;
    }

    if (this.state === 'crashed') {
      if (Phaser.Input.Keyboard.JustDown(this.restartKey)) this.goToLevel(this.levelIndex);
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
    this.spawnRoadworks();
    this.checkCollisions(time);
    this.checkPhase();
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
      .text(leftX, height - 82, '↑ газ  ↓ тормоз\n←→ руль  Space нитро\nP пауза', { ...small, fontSize: '14px' })
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

    // отметка начала фазы 2 (только на уровнях с фазой 2): участок после неё подсвечен оранжевым
    if (this.level.phase2) {
      const phase2Y = barBottom - (barBottom - barTop) * GAME_CONFIG.phase2Progress;
      this.add.rectangle(barX, barTop, 8, phase2Y - barTop, 0x9e4a2a).setOrigin(0.5, 0).setDepth(10);
      this.add.rectangle(barX, phase2Y, 24, 6, 0xfeae34).setDepth(10);
      this.add
        .text(barX - 18, phase2Y, 'ФАЗА 2', { ...small, fontSize: '12px', color: '#feae34' })
        .setOrigin(1, 0.5)
        .setDepth(10);
    }
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

    this.phaseBanner = this.add
      .text(width / 2, height / 3, 'ФАЗА 2\nВечер: больше препятствий,\nвстречка и скорость выше!', {
        ...FONT,
        fontSize: '24px',
        color: '#feae34',
        align: 'center',
        stroke: '#1a1c2c',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(25)
      .setVisible(false);

    this.createPauseOverlay();
    this.updateHud(this.time.now);
  }

  /** Затемнение экрана и надпись PAUSE — поверх всего, скрыто до нажатия P. */
  private createPauseOverlay(): void {
    const { width, height } = this.scale;
    const shade = this.add.rectangle(0, 0, width, height, 0x1a1c2c, 0.6).setOrigin(0, 0);
    const title = this.add
      .text(width / 2, height / 2 - 20, 'PAUSE', {
        ...FONT,
        fontSize: '72px',
        color: '#fee761',
        stroke: '#1a1c2c',
        strokeThickness: 8,
      })
      .setOrigin(0.5);
    const hint = this.add
      .text(width / 2, height / 2 + 40, 'P — продолжить', { ...FONT, fontSize: '20px', color: '#ffffff' })
      .setOrigin(0.5);

    this.pauseOverlay = this.add.container(0, 0, [shade, title, hint]).setDepth(30).setVisible(false);
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
    this.pauseKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
  }

  /**
   * Phaser запоминает нажатие клавиши, пока его не прочитает JustDown.
   * Нажатия Space/R/M/Enter, сделанные раньше (в гонке, на отсчёте, на паузе),
   * не должны срабатывать в новом состоянии — читаем их и выбрасываем.
   * key.reset() не подходит: он «отпускает» зажатую клавишу, и автоповтор нажмёт её снова.
   */
  private forgetKeyPresses(): void {
    for (const key of [this.nitroKey, this.restartKey, this.nextKey, this.garageKey]) {
      Phaser.Input.Keyboard.JustDown(key);
    }
  }

  // --- Пауза ---

  private togglePause(time: number): void {
    if (this.state === 'paused') this.resumeGame(time);
    else if (this.state === 'racing' || this.state === 'countdown') this.pauseGame(time);
    // после аварии и финиша пауза не нужна — там игра и так стоит
  }

  private pauseGame(time: number): void {
    this.stateBeforePause = this.state;
    this.state = 'paused';
    this.pausedAt = time;
    this.tweens.pauseAll(); // замирают всплывающие надписи и отлетающие препятствия
    this.anims.pauseAll(); // и мигалки с рабочими
    this.centerText.setVisible(false); // отсчёт 3-2-1 не должен наезжать на PAUSE; updateCountdown покажет его снова
    this.pauseOverlay.setVisible(true);
  }

  private resumeGame(time: number): void {
    // Таймеры хранят момент времени, а time шёл и во время паузы.
    // Сдвигаем их на длину паузы, иначе нитро и неуязвимость «сгорят» на паузе.
    const pauseDuration = time - this.pausedAt;
    this.raceStartAt += pauseDuration;
    this.nitroUntil += pauseDuration;
    this.nitroReadyAt += pauseDuration;
    this.invulnerableUntil += pauseDuration;

    this.forgetKeyPresses();
    this.tweens.resumeAll();
    this.anims.resumeAll();
    this.pauseOverlay.setVisible(false);
    this.state = this.stateBeforePause;
  }

  // --- Подсказка перед уровнем ---

  /** Затемнение с заголовком, картинками и текстом из levels.ts; гонка ждёт Enter. */
  private showTutorial(): void {
    const tutorial = this.level.tutorial;
    if (!tutorial) return;
    this.state = 'tutorial';

    const { width, height } = this.scale;
    const shade = this.add.rectangle(0, 0, width, height, 0x1a1c2c, 0.88).setOrigin(0, 0);
    const title = this.add
      .text(width / 2, 80, tutorial.title, {
        ...FONT,
        fontSize: '40px',
        color: '#feae34',
        stroke: '#1a1c2c',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    const firstIconX = width / 2 - ((tutorial.icons.length - 1) * TUTORIAL_ICON_SPACING) / 2;
    const icons = tutorial.icons.map((key, i) =>
      this.add.image(firstIconX + i * TUTORIAL_ICON_SPACING, 180, key).setScale(GAME_CONFIG.roadworksSpriteScale),
    );
    const text = this.add
      .text(width / 2, 250, tutorial.text, { ...FONT, fontSize: '20px', color: '#ffffff', align: 'center', lineSpacing: 6 })
      .setOrigin(0.5, 0);
    const hint = this.add
      .text(width / 2, height - 70, 'Enter — понятно, поехали!', {
        ...FONT,
        fontSize: '22px',
        color: '#1a1c2c',
        backgroundColor: '#fee761',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5);

    this.tutorialPanel = this.add.container(0, 0, [shade, title, ...icons, text, hint]).setDepth(28);
  }

  private handleTutorialInput(time: number): void {
    if (!Phaser.Input.Keyboard.JustDown(this.nextKey)) return;

    this.seenTutorials.add(this.levelIndex);
    this.tutorialPanel?.destroy();
    this.tutorialPanel = undefined;
    this.forgetKeyPresses();
    this.state = 'countdown';
    this.raceStartAt = time + GAME_CONFIG.countdownMs; // отсчёт 3-2-1 начинается после подсказки
  }

  // --- Старт ---

  private updateCountdown(time: number): void {
    const left = this.raceStartAt - time;
    if (left > 0) {
      this.centerText.setText(`${this.level.name}\n\n${Math.ceil(left / 1000)}`).setVisible(true);
      return;
    }

    this.state = 'racing';
    this.forgetKeyPresses(); // Space, нажатый на отсчёте, не включает нитро на старте
    this.centerText.setVisible(false);
    this.showPopup(this.scale.width / 2, this.scale.height / 2, 'GO!', '#63c74d');
  }

  // --- Игрок ---

  private isDown(dir: 'up' | 'down' | 'left' | 'right'): boolean {
    return this.cursors[dir].isDown || this.wasd[dir].isDown;
  }

  private updateSpeed(time: number, seconds: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.nitroKey) && time >= this.nitroReadyAt) {
      this.nitroUntil = time + GAME_CONFIG.nitroDurationMs;
      this.nitroReadyAt = time + GAME_CONFIG.nitroCooldownMs;
      this.showPopup(this.player.x, this.player.y - 50, 'НИТРО!', '#94e2ff');
    }

    const hasNitro = time < this.nitroUntil;
    const maxSpeed = hasNitro ? this.rules.maxSpeed * GAME_CONFIG.nitroSpeedBonus : this.rules.maxSpeed;

    if (hasNitro) this.speed += GAME_CONFIG.nitroAcceleration * seconds;
    else if (this.isDown('up')) this.speed += GAME_CONFIG.acceleration * seconds;
    else if (this.isDown('down')) this.speed -= GAME_CONFIG.brake * seconds;
    else this.speed -= GAME_CONFIG.coastSlowdown * seconds;

    // после нитро скорость плавно возвращается к обычному пределу
    if (this.speed > maxSpeed) this.speed = Math.max(maxSpeed, this.speed - GAME_CONFIG.brake * seconds);
    this.speed = Math.max(0, this.speed);
  }

  private steer(seconds: number): void {
    let dx = 0;
    if (this.isDown('left')) dx -= 1;
    if (this.isDown('right')) dx += 1;

    this.player.x += dx * GAME_CONFIG.steerSpeed * seconds;
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

    // убираем всё, что уехало за экран. Сверху уезжают только машины быстрее игрока:
    // дорожные работы появляются целиком далеко над экраном и сами едут вниз
    this.obstacles = this.obstacles.filter((obstacle) => {
      const y = obstacle.sprite.y;
      const isGone = y > height + DESPAWN_MARGIN || (obstacle.speed > 0 && y < SPAWN_Y - DESPAWN_MARGIN);
      if (isGone) obstacle.sprite.destroy();
      return !isGone;
    });
  }

  private laneCenter(lane: number): number {
    return this.roadLeft + this.laneWidth * (lane + 0.5);
  }

  private isLaneFree(lane: number): boolean {
    if (this.isLaneClosed(lane)) return false;
    const x = this.laneCenter(lane);
    // <= : конус на разметке занимает обе соседние полосы, чтобы рядом не появилась «стена»
    return !this.obstacles.some(
      (obstacle) => Math.abs(obstacle.sprite.x - x) <= this.laneWidth / 2 && obstacle.sprite.y < FREE_LANE_ZONE_Y,
    );
  }

  /** Полоса закрыта дорожными работами, пока последний барьер участка не проехал верх экрана. */
  private isLaneClosed(lane: number): boolean {
    const end = this.closedLaneEnd;
    return lane === this.closedLane && end !== undefined && end.active && end.y < FREE_LANE_ZONE_Y;
  }

  private spawnObstacles(): void {
    if (this.finishLine || this.distanceSinceSpawn < this.rules.spawnGap) return;
    this.distanceSinceSpawn = 0;

    const lanes = Array.from({ length: LANE_COUNT }, (_, lane) => lane);
    const freeLanes = lanes.filter((lane) => this.isLaneFree(lane));
    if (freeLanes.length === 0) return;
    const lane = Phaser.Utils.Array.GetRandom(freeLanes);

    if (Math.random() < this.rules.coneChance) this.spawnCone(lane);
    else this.spawnCar(lane);
  }

  private spawnCone(lane: number): void {
    // часть конусов стоит на разметке — иначе можно проехать весь уровень вдоль линии
    const lineX = Math.random() < GAME_CONFIG.lineConeChance ? this.freeLineX(lane) : undefined;
    const x = lineX ?? this.randomXInLane(lane, this.textures.getFrame('cone').width / 2);
    const sprite = this.add.image(x, SPAWN_Y, 'cone').setDepth(2);
    this.obstacles.push({ sprite, speed: 0 });
  }

  /** Случайное место в полосе от края до края (препятствие целиком в полосе) — перекрывает и обочину. */
  private randomXInLane(lane: number, halfWidth: number): number {
    const maxOffset = Math.max(0, this.laneWidth / 2 - halfWidth);
    return this.laneCenter(lane) + Phaser.Math.Between(-maxOffset, maxOffset);
  }

  /** Разметка слева или справа от полосы, если соседняя полоса тоже свободна; иначе undefined. */
  private freeLineX(lane: number): number | undefined {
    const lines: number[] = [];
    if (lane > 0 && this.isLaneFree(lane - 1)) lines.push(lane); // линия между lane-1 и lane
    if (lane < LANE_COUNT - 1 && this.isLaneFree(lane + 1)) lines.push(lane + 1); // между lane и lane+1
    if (lines.length === 0) return undefined;
    return this.roadLeft + Phaser.Utils.Array.GetRandom(lines) * this.laneWidth;
  }

  private spawnCar(lane: number): void {
    const isOncoming = lane < this.rules.oncomingLanes;
    const color = Phaser.Utils.Array.GetRandom(TRAFFIC_COLORS);
    const key = carTextureKey(color);

    // машина едет либо по разметке, либо со случайным сдвигом внутри полосы — не строго по центру
    const halfWidth = (this.textures.getFrame(key).width * GAME_CONFIG.trafficCarScale) / 2;
    const lineX = Math.random() < GAME_CONFIG.lineCarChance ? this.freeLineX(lane) : undefined;
    const x = lineX ?? this.randomXInLane(lane, halfWidth);

    const sprite = this.add
      .image(x, SPAWN_Y, key)
      .setScale(GAME_CONFIG.trafficCarScale)
      .setDepth(2)
      .setFlipY(isOncoming);

    const speed = isOncoming
      ? -this.rules.oncomingSpeed
      : Phaser.Math.Between(this.rules.trafficMinSpeed, this.rules.trafficMaxSpeed);
    this.obstacles.push({ sprite, speed });
  }

  // --- Дорожные работы ---

  /** Участки стоят равномерно по трассе: на 1/(n+1), 2/(n+1)… её длины. */
  private spawnRoadworks(): void {
    const count = this.level.roadworks;
    if (this.finishLine || this.nextRoadworks >= count) return;
    const startAt = (this.level.length * (this.nextRoadworks + 1)) / (count + 1);
    if (this.distance < startAt) return;
    this.nextRoadworks += 1;

    // перекрываем любую полосу, кроме встречных; объезд — в соседнюю попутную
    const firstLane = this.rules.oncomingLanes;
    const lanes = Array.from({ length: LANE_COUNT - firstLane }, (_, i) => firstLane + i);
    const lane = Phaser.Utils.Array.GetRandom(lanes);
    const canLeft = lane - 1 >= firstLane;
    const canRight = lane + 1 < LANE_COUNT;
    const detourRight = canRight && (!canLeft || Math.random() < 0.5);
    const openEdges: Array<'leftEdge' | 'rightEdge'> = [];
    if (lane > 0) openEdges.push('leftEdge');
    if (lane < LANE_COUNT - 1) openEdges.push('rightEdge');

    const coneHalf = this.textures.getFrame('cone').width / 2;
    const xOf = (place: 'center' | 'leftEdge' | 'rightEdge') => {
      if (place === 'leftEdge') return this.laneCenter(lane) - this.laneWidth / 2 + coneHalf;
      if (place === 'rightEdge') return this.laneCenter(lane) + this.laneWidth / 2 - coneHalf;
      return this.laneCenter(lane);
    };

    let farthestOffset = -1;
    for (const piece of roadworksLayout(this, openEdges, detourRight)) {
      const x = xOf(piece.place);
      const y = SPAWN_Y - piece.offset;
      const sprite: ObstacleSprite = piece.anim
        ? this.add.sprite(x, y, piece.key).play(piece.anim)
        : this.add.image(x, y, piece.key);
      if (!piece.cone) sprite.setScale(GAME_CONFIG.roadworksSpriteScale); // конус уже нужного размера
      sprite.setFlipX(piece.flipX ?? false).setDepth(piece.decor ? 1 : 2);
      this.obstacles.push({ sprite, speed: 0, fixed: !piece.cone, decor: piece.decor });

      if (piece.offset > farthestOffset) {
        farthestOffset = piece.offset;
        this.closedLaneEnd = sprite;
      }
    }

    this.closedLane = lane;
    this.moveTrafficOutOfLane(lane, detourRight ? lane + 1 : lane - 1);
  }

  /** Попутные машины в перекрытой полосе перестраиваются в полосу объезда, а не едут сквозь технику. */
  private moveTrafficOutOfLane(lane: number, detourLane: number): void {
    const laneX = this.laneCenter(lane);
    for (const obstacle of this.obstacles) {
      const isTraffic = obstacle.speed > 0 && !obstacle.fixed;
      if (!isTraffic || Math.abs(obstacle.sprite.x - laneX) >= this.laneWidth * 0.75) continue;
      this.tweens.add({ targets: obstacle.sprite, x: this.laneCenter(detourLane), duration: DETOUR_MS });
    }
  }

  // --- Столкновения ---

  private hitbox(sprite: ObstacleSprite): Phaser.Geom.Rectangle {
    const w = sprite.displayWidth * GAME_CONFIG.hitboxScale;
    const h = sprite.displayHeight * GAME_CONFIG.hitboxScale;
    return new Phaser.Geom.Rectangle(sprite.x - w / 2, sprite.y - h / 2, w, h);
  }

  private checkCollisions(time: number): void {
    if (time < this.invulnerableUntil) return;

    const playerBox = this.hitbox(this.player);
    const hit = this.obstacles.find(
      (obstacle) =>
        !obstacle.decor && Phaser.Geom.Intersects.RectangleToRectangle(playerBox, this.hitbox(obstacle.sprite)),
    );
    if (!hit) return;

    this.lives -= 1;
    this.speed *= GAME_CONFIG.crashSpeedFactor;
    this.nitroUntil = 0;
    this.invulnerableUntil = time + GAME_CONFIG.invulnerableMs;
    this.cameras.main.shake(200, 0.012);
    this.cameras.main.flash(150, 228, 59, 68);
    this.showPopup(this.player.x, this.player.y - 50, 'БАМ! -1 ♥', '#ff4d4d');
    this.knockAway(hit);

    if (this.lives <= 0) this.crashOut();
  }

  /** Сбитое препятствие отлетает в сторону и исчезает; тяжёлое (техника, барьер) только вздрагивает. */
  private knockAway(obstacle: Obstacle): void {
    if (obstacle.fixed) {
      this.tweens.add({ targets: obstacle.sprite, x: obstacle.sprite.x + 4, duration: 50, yoyo: true, repeat: 2 });
      return;
    }

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

  // --- Фаза 2 ---

  /**
   * Фаза 2 есть только на уровнях с phase2: true (levels.ts) и начинается,
   * когда пройдена доля трассы GAME_CONFIG.phase2Progress (отметка на полосе прогресса).
   */
  private checkPhase(): void {
    if (!this.level.phase2) return;
    if (this.phase === 1 && this.progress() >= GAME_CONFIG.phase2Progress) this.enterPhase2();
  }

  private enterPhase2(): void {
    this.phase = 2;
    this.rules = withPhase2(this.level);
    this.road.setTint(PHASE_2_ROAD_TINT);
    this.cameras.main.flash(300, 254, 174, 52);

    // надпись «ФАЗА 2» выпрыгивает, держится и исчезает
    this.phaseBanner.setVisible(true).setAlpha(1).setScale(0.5);
    this.tweens.add({ targets: this.phaseBanner, scale: 1, duration: 300, ease: 'Back.Out' });
    this.tweens.add({
      targets: this.phaseBanner,
      alpha: 0,
      delay: 2500,
      duration: 500,
      onComplete: () => this.phaseBanner.setVisible(false),
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
    this.forgetKeyPresses();
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
      this.goToLevel(0);
    } else if (isLastLevel && Phaser.Input.Keyboard.JustDown(this.garageKey)) {
      this.scene.start('ShopScene');
    } else if (!isLastLevel && Phaser.Input.Keyboard.JustDown(this.nextKey)) {
      this.goToLevel(this.levelIndex + 1);
    }
  }

  private crashOut(): void {
    this.state = 'crashed';
    this.forgetKeyPresses();
    this.player.setAlpha(1).setAngle(0).setTint(0x5d5d5d);
    this.updateHud(this.time.now);
    this.centerText
      .setText(`АВАРИЯ!\n\nПроехано: ${Math.floor(this.progress() * 100)}%\n\nR — заново   M — гараж`)
      .setVisible(true);
  }

  /**
   * Единственное место, где сцена перезапускается с данными забега:
   * следующий уровень, повтор уровня после аварии и новая игра после победы.
   * Уровень 0 — новая игра (NEW_RUN); иначе время пройденных уровней сохраняется.
   */
  private goToLevel(levelIndex: number): void {
    const run: RunData = levelIndex === 0 ? NEW_RUN : { levelIndex, totalTime: this.totalTime };
    this.scene.restart(run);
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
