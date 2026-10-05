import Phaser from 'phaser';

// --- Игровые параметры ---
const PLAYER_SPEED = 260;
const PLAYER_SIZE = 42;

const DASH_SPEED = 720; // скорость во время рывка
const DASH_DURATION_MS = 160; // длительность рывка
const DASH_COOLDOWN_MS = 1200; // перезарядка рывка

const TARGET_RADIUS = 18;
const PICKUP_DISTANCE = 42;

const HAZARD_SIZE = 26;
const HAZARD_START_COUNT = 1;
const HAZARD_MIN_SPEED = 140;
const HAZARD_MAX_SPEED = 220;
const POINTS_PER_NEW_HAZARD = 5; // каждые N очков добавляется ещё одна опасность

const START_LIVES = 3;
const INVULNERABLE_MS = 1200; // неуязвимость после удара

const ARENA_TOP = 110; // ниже заголовка и подсказки

type Hazard = {
  body: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
};

/**
 * «Искры»: собирай жёлтые искры, уворачивайся от красных блоков.
 * Каждые POINTS_PER_NEW_HAZARD очков на поле появляется новый блок.
 * Space — рывок (быстрое движение, во время рывка игрок неуязвим).
 * 3 жизни, после поражения R — заново.
 */
export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private target!: Phaser.GameObjects.Arc;
  private hazards: Hazard[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private dashKey!: Phaser.Input.Keyboard.Key;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private dashText!: Phaser.GameObjects.Text;
  private gameOverText!: Phaser.GameObjects.Text;

  private score = 0;
  private best = 0;
  private lives = START_LIVES;
  private isGameOver = false;
  private dashUntil = 0;
  private dashReadyAt = 0;
  private invulnerableUntil = 0;
  private lastDirection = new Phaser.Math.Vector2(1, 0);

  constructor() {
    super('GameScene');
  }

  create(): void {
    const { width, height } = this.scale;

    // create() вызывается и при scene.restart(), поэтому сбрасываем состояние здесь
    this.score = 0;
    this.lives = START_LIVES;
    this.isGameOver = false;
    this.hazards = [];
    this.dashUntil = 0;
    this.dashReadyAt = 0;
    this.invulnerableUntil = 0;

    this.add
      .text(width / 2, 28, 'ИСКРЫ', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '28px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0);

    this.add
      .text(
        width / 2,
        68,
        'Стрелки / WASD — движение, Space — рывок. Собирай жёлтое, избегай красного.',
        {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '18px',
          color: '#cbd5e1',
        },
      )
      .setOrigin(0.5, 0);

    this.add
      .rectangle(0, ARENA_TOP, width, 2, 0x334155)
      .setOrigin(0, 0.5);

    this.player = this.add.rectangle(width / 2, height / 2, PLAYER_SIZE, PLAYER_SIZE, 0x38bdf8);
    this.target = this.add.circle(width * 0.72, height * 0.52, TARGET_RADIUS, 0xfacc15);

    const hudStyle = { fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#ffffff' };
    this.scoreText = this.add.text(24, height - 48, '', hudStyle);
    this.livesText = this.add.text(width / 2, height - 48, '', hudStyle).setOrigin(0.5, 0);
    this.dashText = this.add.text(width - 24, height - 48, '', hudStyle).setOrigin(1, 0);
    this.updateHud();

    this.gameOverText = this.add
      .text(width / 2, height / 2, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '36px',
        color: '#ffffff',
        align: 'center',
        backgroundColor: '#0f172acc',
        padding: { x: 24, y: 16 },
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setVisible(false);

    for (let i = 0; i < HAZARD_START_COUNT; i++) this.spawnHazard();

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
    this.dashKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
  }

  update(time: number, delta: number): void {
    if (this.isGameOver) {
      if (Phaser.Input.Keyboard.JustDown(this.restartKey)) this.scene.restart();
      return;
    }

    const seconds = delta / 1000;
    this.movePlayer(time, seconds);
    this.moveHazards(seconds);
    this.checkTarget();
    this.checkHazards(time);
    this.updatePlayerLook(time);
    this.updateHud(time);
  }

  // --- Игрок ---

  private movePlayer(time: number, seconds: number): void {
    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown || this.wasd.left.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) dx += 1;
    if (this.cursors.up.isDown || this.wasd.up.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.wasd.down.isDown) dy += 1;

    if (dx !== 0 || dy !== 0) {
      this.lastDirection.set(dx, dy).normalize();
    }

    if (Phaser.Input.Keyboard.JustDown(this.dashKey) && time >= this.dashReadyAt) {
      this.dashUntil = time + DASH_DURATION_MS;
      this.dashReadyAt = time + DASH_COOLDOWN_MS;
    }

    const isDashing = time < this.dashUntil;
    if (isDashing) {
      // во время рывка летим в последнем направлении, даже если клавиши отпущены
      this.player.x += this.lastDirection.x * DASH_SPEED * seconds;
      this.player.y += this.lastDirection.y * DASH_SPEED * seconds;
    } else if (dx !== 0 || dy !== 0) {
      this.player.x += this.lastDirection.x * PLAYER_SPEED * seconds;
      this.player.y += this.lastDirection.y * PLAYER_SPEED * seconds;
    }

    this.keepPlayerOnScreen();
  }

  private keepPlayerOnScreen(): void {
    const half = this.player.width / 2;
    this.player.x = Phaser.Math.Clamp(this.player.x, half, this.scale.width - half);
    this.player.y = Phaser.Math.Clamp(this.player.y, ARENA_TOP + half, this.scale.height - half);
  }

  private updatePlayerLook(time: number): void {
    const isDashing = time < this.dashUntil;
    const isInvulnerable = time < this.invulnerableUntil;

    this.player.setFillStyle(isDashing ? 0xe0f2fe : 0x38bdf8);
    // мигание после удара
    this.player.setAlpha(isInvulnerable && Math.floor(time / 100) % 2 === 0 ? 0.3 : 1);
  }

  // --- Цель ---

  private checkTarget(): void {
    const distance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.target.x,
      this.target.y,
    );

    if (distance > PICKUP_DISTANCE) return;

    this.score += 1;
    this.showPopup(this.target.x, this.target.y, '+1', '#facc15');
    this.tweens.add({ targets: this.player, scale: 1.25, duration: 80, yoyo: true });

    if (this.score % POINTS_PER_NEW_HAZARD === 0) {
      this.spawnHazard();
      this.showPopup(this.scale.width / 2, ARENA_TOP + 40, 'Новая опасность!', '#f87171');
    }

    this.moveTargetAwayFromPlayer();
  }

  private moveTargetAwayFromPlayer(): void {
    // не ставим цель прямо под игроком
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = Phaser.Math.Between(60, this.scale.width - 60);
      const y = Phaser.Math.Between(ARENA_TOP + 30, this.scale.height - 80);
      if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) > 200) {
        this.target.setPosition(x, y);
        return;
      }
    }
  }

  // --- Опасности ---

  private spawnHazard(): void {
    const { width, height } = this.scale;
    // появляется у верхнего или нижнего края, подальше от игрока
    const y = this.player && this.player.y > height / 2 ? ARENA_TOP + HAZARD_SIZE : height - HAZARD_SIZE;
    const x = Phaser.Math.Between(HAZARD_SIZE, width - HAZARD_SIZE);
    const body = this.add.rectangle(x, y, HAZARD_SIZE, HAZARD_SIZE, 0xef4444);

    const speed = Phaser.Math.Between(HAZARD_MIN_SPEED, HAZARD_MAX_SPEED);
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    this.hazards.push({ body, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });

    this.tweens.add({ targets: body, scale: { from: 0, to: 1 }, duration: 300 });
  }

  private moveHazards(seconds: number): void {
    const half = HAZARD_SIZE / 2;
    const { width, height } = this.scale;

    for (const hazard of this.hazards) {
      hazard.body.x += hazard.vx * seconds;
      hazard.body.y += hazard.vy * seconds;

      // отскок от стен арены
      if (hazard.body.x < half || hazard.body.x > width - half) {
        hazard.vx *= -1;
        hazard.body.x = Phaser.Math.Clamp(hazard.body.x, half, width - half);
      }
      if (hazard.body.y < ARENA_TOP + half || hazard.body.y > height - half) {
        hazard.vy *= -1;
        hazard.body.y = Phaser.Math.Clamp(hazard.body.y, ARENA_TOP + half, height - half);
      }
    }
  }

  private checkHazards(time: number): void {
    const isProtected = time < this.dashUntil || time < this.invulnerableUntil;
    if (isProtected) return;

    const playerBounds = this.player.getBounds();
    const hit = this.hazards.some((hazard) =>
      Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, hazard.body.getBounds()),
    );
    if (!hit) return;

    this.lives -= 1;
    this.invulnerableUntil = time + INVULNERABLE_MS;
    this.cameras.main.shake(200, 0.01);
    this.cameras.main.flash(150, 239, 68, 68);
    this.showPopup(this.player.x, this.player.y - 30, '-1 ♥', '#f87171');

    if (this.lives <= 0) this.gameOver();
  }

  // --- Интерфейс и конец игры ---

  private updateHud(time = 0): void {
    this.scoreText.setText(`Очки: ${this.score}`);
    this.livesText.setText(`Жизни: ${'♥'.repeat(Math.max(this.lives, 0))}`);

    const cooldownLeft = Math.max(0, this.dashReadyAt - time);
    this.dashText.setText(cooldownLeft > 0 ? `Рывок: ${(cooldownLeft / 1000).toFixed(1)}с` : 'Рывок: готов');
    this.dashText.setColor(cooldownLeft > 0 ? '#94a3b8' : '#4ade80');
  }

  private showPopup(x: number, y: number, message: string, color: string): void {
    const text = this.add
      .text(x, y, message, { fontFamily: 'system-ui, sans-serif', fontSize: '22px', color })
      .setOrigin(0.5);

    this.tweens.add({
      targets: text,
      y: y - 40,
      alpha: 0,
      duration: 700,
      onComplete: () => text.destroy(),
    });
  }

  private gameOver(): void {
    this.isGameOver = true;
    this.best = Math.max(this.best, this.score);
    this.player.setAlpha(1).setFillStyle(0x64748b);
    this.updateHud();
    this.gameOverText
      .setText(`ИГРА ОКОНЧЕНА\nОчки: ${this.score}   Рекорд: ${this.best}\n\nR — заново`)
      .setVisible(true);
  }
}
