import Phaser from 'phaser';
import barnUrl from '../assets/buildings/house_barn.png';
import blueUrl from '../assets/buildings/house_blue.png';
import farmUrl from '../assets/buildings/house_farm.png';
import garageUrl from '../assets/buildings/house_garage.png';
import redUrl from '../assets/buildings/house_red.png';
import shedUrl from '../assets/buildings/house_shed.png';
import slateUrl from '../assets/buildings/house_slate.png';
import woodUrl from '../assets/buildings/house_wood.png';

// Домики на обочине (вид сверху): AI-картинка, вырезанная и уменьшенная до пиксель-арта
const SPRITES: Record<string, string> = {
  house_red: redUrl,
  house_wood: woodUrl,
  house_slate: slateUrl,
  house_barn: barnUrl,
  house_shed: shedUrl,
  house_farm: farmUrl,
  house_garage: garageUrl,
  house_blue: blueUrl,
};

export const BUILDING_KEYS = Object.keys(SPRITES);

export function loadBuildingAssets(scene: Phaser.Scene): void {
  for (const [key, url] of Object.entries(SPRITES)) {
    if (!scene.textures.exists(key)) scene.load.image(key, url);
  }
}

/** Случайный домик, но не такой же, как предыдущий на этой стороне дороги. */
export function pickBuildingKey(previous?: string): string {
  const choices = BUILDING_KEYS.filter((key) => key !== previous);
  return Phaser.Utils.Array.GetRandom(choices);
}
