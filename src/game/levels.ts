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
  theme: RoadTheme;
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
    theme: {
      side: 0xe4a672,
      sideDark: 0xb86f50,
      curbA: 0xffffff,
      curbB: 0xf77622,
      asphalt: 0x5a6988,
      line: 0xfee761,
    },
  },
];
