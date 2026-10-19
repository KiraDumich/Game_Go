import honoSelectUrl from '../assets/cars/car_hono_select.png';
import honoTopUrl from '../assets/cars/car_hono_top.png';
import kazeSelectUrl from '../assets/cars/car_kaze_select.png';
import kazeTopUrl from '../assets/cars/car_kaze_top.png';
import kuroSelectUrl from '../assets/cars/car_kuro_select.png';
import kuroTopUrl from '../assets/cars/car_kuro_top.png';
import raijinSelectUrl from '../assets/cars/car_raijin_select.png';
import raijinTopUrl from '../assets/cars/car_raijin_top.png';
import { carTextureKey } from './pixelArt';

export type CarInfo = {
  id: string;
  name: string;
  description: string;
  price: number; // пока все машины бесплатные
  topKey: string; // текстура вида сверху (для гонки)
  topUrl?: string; // если нет — текстура рисуется кодом в pixelArt.ts
  topScale: number; // во сколько раз увеличить спрайт в гонке
  selectKey?: string; // вид 3/4 для гаража
  selectUrl?: string;
};

export const CARS: CarInfo[] = [
  {
    id: 'classic',
    name: 'Aka Classic',
    description: 'Старая добрая\nкрасная машинка',
    price: 0,
    topKey: carTextureKey('player'),
    topScale: 1,
  },
  {
    id: 'kaze',
    name: 'Kaze CR',
    description: 'Городской кроссовер\nцвета мокрого асфальта',
    price: 0,
    topKey: 'car-kaze-top',
    topUrl: kazeTopUrl,
    topScale: 2,
    selectKey: 'car-kaze-select',
    selectUrl: kazeSelectUrl,
  },
  {
    id: 'raijin',
    name: 'Raijin MK4',
    description: 'Белое спорткупе\nс большим спойлером',
    price: 0,
    topKey: 'car-raijin-top',
    topUrl: raijinTopUrl,
    topScale: 2,
    selectKey: 'car-raijin-select',
    selectUrl: raijinSelectUrl,
  },
  {
    id: 'kuro',
    name: 'Kuro Boss',
    description: 'Чёрный маслкар\nс компрессором на капоте',
    price: 0,
    topKey: 'car-kuro-top',
    topUrl: kuroTopUrl,
    topScale: 2,
    selectKey: 'car-kuro-select',
    selectUrl: kuroSelectUrl,
  },
  {
    id: 'hono',
    name: 'Hono F4',
    description: 'Красный суперкар\nс огромным антикрылом',
    price: 0,
    topKey: 'car-hono-top',
    topUrl: honoTopUrl,
    topScale: 2,
    selectKey: 'car-hono-select',
    selectUrl: honoSelectUrl,
  },
];

const SELECTED_CAR_STORAGE_KEY = 'pixel-racing-car';
export const DEFAULT_CAR = CARS[0]!;

export function findCar(id: string | null | undefined): CarInfo {
  return CARS.find((car) => car.id === id) ?? DEFAULT_CAR;
}

/** Выбранная машина запоминается в браузере, чтобы не выбирать её каждый раз. */
export function loadSelectedCarId(): string | null {
  try {
    return localStorage.getItem(SELECTED_CAR_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveSelectedCarId(id: string): void {
  try {
    localStorage.setItem(SELECTED_CAR_STORAGE_KEY, id);
  } catch {
    // без localStorage выбор просто не сохранится между перезагрузками
  }
}
