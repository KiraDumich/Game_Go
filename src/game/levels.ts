import { GAME_CONFIG } from './gameConfig';
import type { RoadTheme } from './pixelArt';

export type LevelConfig = {
  name: string;
  length: number; // сколько пикселей нужно проехать до финиша
  maxSpeed: number; // максимальная скорость игрока, px/с
  spawnGap: number; // через сколько пикселей пути появляется новое препятствие
  coneChance: number; // доля конусов среди препятствий (остальное — машины)
  trafficMinSpeed: number; // скорость попутных машин, px/с
  trafficMaxSpeed: number;
  oncomingLanes: number; // сколько левых полос занято встречкой (0 — встречки нет)
  oncomingSpeed: number; // скорость встречных машин, px/с
  roadworks: number; // сколько участков дорожных работ на уровне (равномерно по трассе)
  phase2: boolean; // включается ли с середины трассы фаза 2 (вечер, больше препятствий)
  tutorial?: LevelTutorial; // подсказка перед первым стартом уровня
  theme: RoadTheme;
};

export type LevelTutorial = {
  title: string;
  text: string;
  icons: string[]; // ключи текстур, которые показываются в подсказке
};

export const LEVELS: LevelConfig[] = [
  {
    name: 'Уровень 1 — Загородное шоссе',
    length: 14000,
    maxSpeed: 520,
    spawnGap: 260,
    coneChance: 0.45,
    trafficMinSpeed: 160,
    trafficMaxSpeed: 260,
    oncomingLanes: 0,
    oncomingSpeed: 0,
    roadworks: 0,
    phase2: false,
    theme: {
      side: 0x3e8948,
      sideDark: 0x265c42,
      curbA: 0xffffff,
      curbB: 0xe43b44,
      asphalt: 0x3a4466,
      line: 0xffffff,
    },
  },
  {
    name: 'Уровень 2 — Пустынная трасса',
    length: 20000,
    maxSpeed: 640,
    spawnGap: 200,
    coneChance: 0.3,
    trafficMinSpeed: 200,
    trafficMaxSpeed: 320,
    oncomingLanes: 1,
    oncomingSpeed: 220,
    roadworks: 0,
    phase2: true, // вторая волна (вечер) с середины трассы — только на этом уровне
    theme: {
      side: 0xe4a672,
      sideDark: 0xb86f50,
      curbA: 0xffffff,
      curbB: 0xf77622,
      asphalt: 0x5a6988,
      line: 0xfee761,
    },
  },
  {
    name: 'Уровень 3 — Ремонт трассы',
    length: 20000,
    maxSpeed: 600,
    spawnGap: 230,
    coneChance: 0.35,
    trafficMinSpeed: 180,
    trafficMaxSpeed: 300,
    oncomingLanes: 1,
    oncomingSpeed: 230,
    roadworks: 3,
    phase2: false,
    tutorial: {
      title: 'ДОРОЖНЫЕ РАБОТЫ',
      text:
        'На этой трассе три участка ремонта.\n' +
        'Знак и жёлтая стрелка заранее предупреждают:\n' +
        'впереди перекрыта полоса — перестройся туда,\n' +
        'куда показывает стрелка.\n\n' +
        'Барьеры, техника и рабочие не отлетают от удара,\n' +
        'в них врезаться больнее, чем в конус!',
      icons: ['rw_sign_works', 'rw_sign_arrow', 'rw_barrier_1', 'rw_worker_0'],
    },
    theme: {
      side: 0xc0cbdc, // бетон промзоны
      sideDark: 0x8b9bb4,
      curbA: 0xffffff,
      curbB: 0xf77622,
      asphalt: 0x3a4466,
      line: 0xfee761, // жёлтая временная разметка — как на ремонте
    },
  },
];

// --- Фаза 2: числа баланса — в gameConfig.ts (phase2*) ---
export const PHASE_2_ROAD_TINT = 0x8a96d8; // трасса темнеет — наступает вечер

/** Правила уровня с поправками второй фазы. Сам уровень не меняется. */
export function withPhase2(level: LevelConfig): LevelConfig {
  return {
    ...level,
    maxSpeed: level.maxSpeed * GAME_CONFIG.phase2SpeedFactor,
    spawnGap: level.spawnGap * GAME_CONFIG.phase2SpawnGapFactor,
    oncomingLanes: level.oncomingLanes + GAME_CONFIG.phase2ExtraOncomingLanes,
    oncomingSpeed: Math.max(level.oncomingSpeed, GAME_CONFIG.phase2MinOncomingSpeed),
  };
}
