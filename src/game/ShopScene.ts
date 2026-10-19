import Phaser from 'phaser';
import { CARS, findCar, loadSelectedCarId, saveSelectedCarId, type CarInfo } from './cars';
import { makeSpriteTextures } from './pixelArt';

// --- Раскладка гаража ---
const CARD_WIDTH = 280;
const CARD_HEIGHT = 380;
const CARD_GAP = 20;
const CARD_CENTER_Y = 330;
const VISIBLE_CARDS = 3; // сколько карточек видно сразу, остальные листаются стрелками
const SELECT_VIEW_SCALE = 4; // вид 3/4: 64 px → 256 px
const CLASSIC_PREVIEW_SCALE = 2; // у классики нет вида 3/4, показываем вид сверху

const COLOR_CARD = 0x262b44;
const COLOR_CARD_ACTIVE = 0x3a4466;
const COLOR_BORDER = 0x5a6988;
const COLOR_BORDER_ACTIVE = 0xfee761;

const FONT = { fontFamily: '"Courier New", monospace', fontStyle: 'bold' };

type Card = {
  car: CarInfo;
  container: Phaser.GameObjects.Container; // вся карточка целиком, двигается при листании
  frame: Phaser.GameObjects.Rectangle;
};

/** Мини-магазин (гараж): выбор машины перед гонкой. Пока все машины бесплатные. */
export class ShopScene extends Phaser.Scene {
  private cards: Card[] = [];
  private selectedIndex = 0;
  private firstSlotX = 0;
  private arrowLeft!: Phaser.GameObjects.Text;
  private arrowRight!: Phaser.GameObjects.Text;

  constructor() {
    super('ShopScene');
  }

  preload(): void {
    // при возврате в гараж картинки уже загружены — повторно не грузим
    for (const car of CARS) {
      if (car.topUrl && !this.textures.exists(car.topKey)) this.load.image(car.topKey, car.topUrl);
      if (car.selectKey && car.selectUrl && !this.textures.exists(car.selectKey)) {
        this.load.image(car.selectKey, car.selectUrl);
      }
    }
  }

  create(): void {
    makeSpriteTextures(this);

    const { width, height } = this.scale;
    const savedCar = findCar(loadSelectedCarId());
    this.selectedIndex = Math.max(0, CARS.indexOf(savedCar));

    this.add
      .text(width / 2, 36, 'ГАРАЖ', { ...FONT, fontSize: '40px', color: '#fee761', stroke: '#1a1c2c', strokeThickness: 6 })
      .setOrigin(0.5, 0);
    this.add
      .text(width / 2, 90, 'Выбери машину для заезда', { ...FONT, fontSize: '18px', color: '#c0cbdc' })
      .setOrigin(0.5, 0);

    const slots = Math.min(VISIBLE_CARDS, CARS.length);
    const totalWidth = slots * CARD_WIDTH + (slots - 1) * CARD_GAP;
    this.firstSlotX = (width - totalWidth) / 2 + CARD_WIDTH / 2;
    this.cards = CARS.map((car, index) => this.createCard(car, index));
    this.createArrows();

    this.createStartButton(width / 2, height - 60);
    this.add
      .text(width / 2, height - 22, '←→ выбрать   Enter — в гонку', { ...FONT, fontSize: '14px', color: '#8b9bb4' })
      .setOrigin(0.5);

    this.createInput();
    this.highlightSelected();
  }

  private createCard(car: CarInfo, index: number): Card {
    // координаты внутри карточки отсчитываются от её центра
    const top = -CARD_HEIGHT / 2;
    const frame = this.add
      .rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, COLOR_CARD)
      .setStrokeStyle(4, COLOR_BORDER)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.select(index));

    const preview = car.selectKey
      ? this.add.image(0, top + 120, car.selectKey).setScale(SELECT_VIEW_SCALE)
      : this.add.image(0, top + 120, car.topKey).setScale(CLASSIC_PREVIEW_SCALE);

    const name = this.add.text(0, top + 220, car.name, { ...FONT, fontSize: '24px', color: '#ffffff' }).setOrigin(0.5, 0);
    const description = this.add
      .text(0, top + 256, car.description, { ...FONT, fontSize: '14px', color: '#c0cbdc', align: 'center' })
      .setOrigin(0.5, 0);
    const price = this.add
      .text(0, top + 330, car.price === 0 ? 'БЕСПЛАТНО' : `${car.price} ¥`, {
        ...FONT,
        fontSize: '20px',
        color: '#63c74d',
      })
      .setOrigin(0.5, 0);

    const container = this.add.container(0, CARD_CENTER_Y, [frame, preview, name, description, price]);
    return { car, container, frame };
  }

  private createArrows(): void {
    const style = { ...FONT, fontSize: '40px', color: '#fee761' };
    const leftX = this.firstSlotX - CARD_WIDTH / 2 - 28;
    const rightX = this.scale.width - leftX;
    this.arrowLeft = this.add
      .text(leftX, CARD_CENTER_Y, '<', style)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.select(this.selectedIndex - 1));
    this.arrowRight = this.add
      .text(rightX, CARD_CENTER_Y, '>', style)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.select(this.selectedIndex + 1));
  }

  /** Ставит видимые карточки по местам так, чтобы выбранная всегда была на экране. */
  private layoutCards(): void {
    const maxOffset = Math.max(0, CARS.length - VISIBLE_CARDS);
    const offset = Phaser.Math.Clamp(this.selectedIndex - 1, 0, maxOffset);

    this.cards.forEach((card, index) => {
      const slot = index - offset;
      card.container.setVisible(slot >= 0 && slot < VISIBLE_CARDS);
      card.container.x = this.firstSlotX + slot * (CARD_WIDTH + CARD_GAP);
    });

    this.arrowLeft.setVisible(offset > 0);
    this.arrowRight.setVisible(offset < maxOffset);
  }

  private createStartButton(x: number, y: number): void {
    this.add
      .text(x, y, '  В ГОНКУ  ', {
        ...FONT,
        fontSize: '26px',
        color: '#1a1c2c',
        backgroundColor: '#fee761',
        padding: { x: 12, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.startRace());
  }

  private createInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is unavailable.');

    keyboard.on('keydown-LEFT', () => this.select(this.selectedIndex - 1));
    keyboard.on('keydown-A', () => this.select(this.selectedIndex - 1));
    keyboard.on('keydown-RIGHT', () => this.select(this.selectedIndex + 1));
    keyboard.on('keydown-D', () => this.select(this.selectedIndex + 1));
    keyboard.on('keydown-ENTER', () => this.startRace());
    keyboard.on('keydown-SPACE', () => this.startRace());
  }

  private select(index: number): void {
    this.selectedIndex = Phaser.Math.Wrap(index, 0, CARS.length);
    this.highlightSelected();
  }

  private highlightSelected(): void {
    this.layoutCards();
    this.cards.forEach((card, index) => {
      const isActive = index === this.selectedIndex;
      card.frame.setFillStyle(isActive ? COLOR_CARD_ACTIVE : COLOR_CARD);
      card.frame.setStrokeStyle(4, isActive ? COLOR_BORDER_ACTIVE : COLOR_BORDER);
    });
  }

  private startRace(): void {
    const car = CARS[this.selectedIndex] ?? CARS[0]!;
    saveSelectedCarId(car.id);
    this.registry.set('carId', car.id);
    this.scene.start('GameScene', { levelIndex: 0, totalTime: 0 });
  }
}
