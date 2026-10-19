import Phaser from 'phaser';

// Размер одного «пикселя» спрайта в настоящих пикселях экрана
export const PIXEL_SIZE = 4;

type Palette = Record<string, number>;

/**
 * Рисует текстуру по текстовой карте: каждый символ — один пиксель,
 * цвет берётся из палитры, '.' (или символ без цвета) — прозрачный.
 */
export function makePixelTexture(
  scene: Phaser.Scene,
  key: string,
  rows: string[],
  palette: Palette,
): void {
  if (scene.textures.exists(key)) return;

  const g = scene.make.graphics({}, false);
  rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      const color = palette[char];
      if (color === undefined) return;
      g.fillStyle(color);
      g.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
    });
  });

  const width = Math.max(...rows.map((row) => row.length)) * PIXEL_SIZE;
  g.generateTexture(key, width, rows.length * PIXEL_SIZE);
  g.destroy();
}

// --- Карты спрайтов ---

// Машина, вид сверху, капот смотрит вверх. B — кузов, D — тёмный кузов
const CAR_ROWS = [
  '..kBBBBk..',
  '.kyBBBByk.',
  '.kBBBBBBk.',
  'kkBwwwwBkk',
  'kkwwwwwwkk',
  '.kBwwwwBk.',
  '.kBBBBBBk.',
  '.kBDBBDBk.',
  '.kBDBBDBk.',
  '.kBBBBBBk.',
  'kkBwwwwBkk',
  'kkBBBBBBkk',
  '.kBBBBBBk.',
  '.kDDDDDDk.',
  '.ktDDDDtk.',
  '..kkkkkk..',
];

const CONE_ROWS = [
  '...oo...',
  '...oo...',
  '..owwo..',
  '..oooo..',
  '.oooooo.',
  '.owwwwo.',
  'oooooooo',
  'kkkkkkkk',
];

const CAR_BASE_PALETTE: Palette = {
  k: 0x1a1c2c,
  w: 0x94e2ff,
  y: 0xffef8a,
  t: 0xff4d4d,
};

// Цвета кузова: [основной, тёмный]
export const CAR_COLORS = {
  player: [0xe43b44, 0x9e2835],
  yellow: [0xfeae34, 0xc06a1f],
  green: [0x63c74d, 0x3e8948],
  purple: [0xb55088, 0x68386c],
  white: [0xe0e0e0, 0x8b9bb4],
} as const;

export type CarColor = keyof typeof CAR_COLORS;
export const TRAFFIC_COLORS: CarColor[] = ['yellow', 'green', 'purple', 'white'];

export function carTextureKey(color: CarColor): string {
  return `car-${color}`;
}

/** Создаёт все текстуры машин и конуса (один раз за запуск игры). */
export function makeSpriteTextures(scene: Phaser.Scene): void {
  for (const color of Object.keys(CAR_COLORS) as CarColor[]) {
    const [body, dark] = CAR_COLORS[color];
    makePixelTexture(scene, carTextureKey(color), CAR_ROWS, { ...CAR_BASE_PALETTE, B: body, D: dark });
  }

  makePixelTexture(scene, 'cone', CONE_ROWS, { o: 0xf77622, w: 0xffffff, k: 0x262b44 });
}

/** Клетчатая полоса финиша. */
export function makeFinishTexture(scene: Phaser.Scene, width: number): void {
  if (scene.textures.exists('finish')) return;

  const cell = PIXEL_SIZE * 4;
  const g = scene.make.graphics({}, false);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col * cell < width; col++) {
      g.fillStyle((row + col) % 2 === 0 ? 0xffffff : 0x1a1c2c);
      g.fillRect(col * cell, row * cell, cell, cell);
    }
  }
  g.generateTexture('finish', width, cell * 2);
  g.destroy();
}

export type RoadTheme = {
  side: number; // обочина (трава / песок)
  sideDark: number; // полосы на обочине, чтобы было видно скорость
  curbA: number;
  curbB: number;
  asphalt: number;
  line: number; // разметка
};

export const ROAD_TILE_HEIGHT = 128;

/**
 * Один «кадр» дороги на всю ширину экрана. Он повторяется по вертикали
 * в TileSprite, а прокрутка tilePositionY создаёт ощущение движения.
 */
export function makeRoadTexture(
  scene: Phaser.Scene,
  key: string,
  theme: RoadTheme,
  screenWidth: number,
  roadLeft: number,
  roadWidth: number,
  laneCount: number,
): void {
  if (scene.textures.exists(key)) return;

  const h = ROAD_TILE_HEIGHT;
  const p = PIXEL_SIZE;
  const curbWidth = p * 3;
  const roadRight = roadLeft + roadWidth;
  const g = scene.make.graphics({}, false);

  // обочина: две полосы разного оттенка
  g.fillStyle(theme.side);
  g.fillRect(0, 0, screenWidth, h);
  g.fillStyle(theme.sideDark);
  g.fillRect(0, 0, screenWidth, h / 2);

  // пиксельные кустики / камешки на обочине
  g.fillStyle(theme.sideDark);
  const tufts = [
    [40, 80], [120, 100], [180, 20], [70, 30],
    [roadRight + 50, 90], [roadRight + 140, 24], [roadRight + 200, 110], [roadRight + 90, 60],
  ];
  for (const [x, y] of tufts) {
    g.fillRect(x, y, p * 2, p);
    g.fillRect(x + p / 2, y - p, p, p);
  }

  // асфальт
  g.fillStyle(theme.asphalt);
  g.fillRect(roadLeft, 0, roadWidth, h);

  // бордюры в полоску
  const curbStep = p * 4;
  for (let y = 0; y < h; y += curbStep) {
    g.fillStyle((y / curbStep) % 2 === 0 ? theme.curbA : theme.curbB);
    g.fillRect(roadLeft - curbWidth, y, curbWidth, curbStep);
    g.fillRect(roadRight, y, curbWidth, curbStep);
  }

  // прерывистая разметка между полосами
  g.fillStyle(theme.line);
  const laneWidth = roadWidth / laneCount;
  for (let lane = 1; lane < laneCount; lane++) {
    g.fillRect(roadLeft + lane * laneWidth - p, 0, p * 2, h / 2);
  }

  g.generateTexture(key, screenWidth, h);
  g.destroy();
}
