import Phaser from 'phaser';
import barrier0Url from '../assets/roadworks/rw_barrier_0.png';
import barrier1Url from '../assets/roadworks/rw_barrier_1.png';
import excavatorUrl from '../assets/roadworks/rw_excavator.png';
import patchUrl from '../assets/roadworks/rw_patch.png';
import rollerUrl from '../assets/roadworks/rw_roller.png';
import signArrowUrl from '../assets/roadworks/rw_sign_arrow.png';
import signWorksUrl from '../assets/roadworks/rw_sign_works.png';
import truckUrl from '../assets/roadworks/rw_truck.png';
import worker0Url from '../assets/roadworks/rw_worker_0.png';
import worker1Url from '../assets/roadworks/rw_worker_1.png';
import workerDigUrl from '../assets/roadworks/rw_worker_dig.png';
import workerShovelUrl from '../assets/roadworks/rw_worker_shovel.png';
import { GAME_CONFIG } from './gameConfig';

// Спрайты дорожных работ: AI-картинка, вырезанная и уменьшенная до пиксель-арта
const SPRITES: Record<string, string> = {
  rw_barrier_0: barrier0Url,
  rw_barrier_1: barrier1Url,
  rw_sign_works: signWorksUrl,
  rw_sign_arrow: signArrowUrl,
  rw_worker_0: worker0Url,
  rw_worker_1: worker1Url,
  rw_worker_shovel: workerShovelUrl,
  rw_worker_dig: workerDigUrl,
  rw_excavator: excavatorUrl,
  rw_roller: rollerUrl,
  rw_truck: truckUrl,
  rw_patch: patchUrl,
};

const BARRIER_ANIM = 'rw_barrier_blink'; // мигалки на барьере
const WORKER_ANIM = 'rw_worker_wave'; // рабочий машет флажком

// Что может стоять внутри перекрытой полосы (порядок перемешивается для каждого участка)
const ZONE_ITEMS = ['rw_excavator', 'rw_worker_0', 'rw_roller', 'rw_worker_shovel', 'rw_truck', 'rw_worker_dig'];
const ITEM_GAP = 40; // расстояние между предметами внутри участка, px
const BARRIER_PADDING = 70; // от барьера до первого/последнего предмета, px
const ARROW_SIGN_SHARE = 0.45; // стрелка стоит между знаком и барьером

/** Одна деталь участка. offset — насколько далеко ВПЕРЕДИ (выше по экрану) она стоит, px. */
export type RoadworksPiece = {
  key: string;
  offset: number;
  place: 'center' | 'leftEdge' | 'rightEdge'; // в центре перекрытой полосы или у её края
  anim?: string;
  flipX?: boolean;
  decor?: boolean; // только картинка: не сталкивается
  cone?: boolean; // обычный конус: отлетает при ударе
};

export function loadRoadworksAssets(scene: Phaser.Scene): void {
  for (const [key, url] of Object.entries(SPRITES)) {
    if (!scene.textures.exists(key)) scene.load.image(key, url);
  }
}

export function createRoadworksAnimations(scene: Phaser.Scene): void {
  if (!scene.anims.exists(BARRIER_ANIM)) {
    scene.anims.create({
      key: BARRIER_ANIM,
      frames: [{ key: 'rw_barrier_0' }, { key: 'rw_barrier_1' }],
      frameRate: 3,
      repeat: -1,
    });
  }
  if (!scene.anims.exists(WORKER_ANIM)) {
    scene.anims.create({
      key: WORKER_ANIM,
      frames: [{ key: 'rw_worker_0' }, { key: 'rw_worker_1' }],
      frameRate: 2,
      repeat: -1,
    });
  }
}

/**
 * Раскладка одного участка (снизу вверх, как его встречает игрок):
 * знак «Дорожные работы» → стрелка объезда → барьер → техника и рабочие
 * за конусами вдоль открытых краёв → барьер.
 */
export function roadworksLayout(
  scene: Phaser.Scene,
  openEdges: Array<'leftEdge' | 'rightEdge'>,
  detourRight: boolean,
): RoadworksPiece[] {
  const { roadworksLength, roadworksSignLead, roadworksConeGap, roadworksSpriteScale } = GAME_CONFIG;
  const heightOf = (key: string) => scene.textures.getFrame(key).height * roadworksSpriteScale;
  const start = roadworksSignLead;
  const end = start + roadworksLength;

  const pieces: RoadworksPiece[] = [
    { key: 'rw_sign_works', offset: 0, place: 'center' },
    // стрелка нарисована влево — для объезда справа отражаем
    { key: 'rw_sign_arrow', offset: start * ARROW_SIGN_SHARE, place: 'center', flipX: detourRight },
    { key: 'rw_barrier_0', offset: start, place: 'center', anim: BARRIER_ANIM },
    { key: 'rw_patch', offset: (start + end) / 2, place: 'center', decor: true },
  ];

  // техника и рабочие друг за другом, пока помещаются между барьерами
  let y = start + BARRIER_PADDING;
  for (const key of Phaser.Utils.Array.Shuffle([...ZONE_ITEMS])) {
    const h = heightOf(key);
    if (y + h > end - BARRIER_PADDING) continue;
    pieces.push({ key, offset: y + h / 2, place: 'center', anim: key === 'rw_worker_0' ? WORKER_ANIM : undefined });
    y += h + ITEM_GAP;
  }

  // конусы вдоль краёв, за которыми открытые полосы
  for (let c = start + roadworksConeGap / 2; c < end; c += roadworksConeGap) {
    for (const place of openEdges) pieces.push({ key: 'cone', offset: c, place, cone: true });
  }

  pieces.push({ key: 'rw_barrier_0', offset: end, place: 'center', anim: BARRIER_ANIM });
  return pieces;
}
