import Phaser from 'phaser';
import desertAdobeUrl from '../assets/buildings/desert_adobe.png';
import desertDinerUrl from '../assets/buildings/desert_diner.png';
import desertGasUrl from '../assets/buildings/desert_gas.png';
import desertMotelUrl from '../assets/buildings/desert_motel.png';
import desertRanchUrl from '../assets/buildings/desert_ranch.png';
import desertShackUrl from '../assets/buildings/desert_shack.png';
import desertTealUrl from '../assets/buildings/desert_teal.png';
import desertTowerUrl from '../assets/buildings/desert_tower.png';
import indCabinsUrl from '../assets/buildings/ind_cabins.png';
import indFactoryUrl from '../assets/buildings/ind_factory.png';
import indMaterialsUrl from '../assets/buildings/ind_materials.png';
import indSilosUrl from '../assets/buildings/ind_silos.png';
import indToiletsUrl from '../assets/buildings/ind_toilets.png';
import indTrailerUrl from '../assets/buildings/ind_trailer.png';
import indUnfinishedUrl from '../assets/buildings/ind_unfinished.png';
import indWarehouseUrl from '../assets/buildings/ind_warehouse.png';
import barnUrl from '../assets/buildings/house_barn.png';
import blueUrl from '../assets/buildings/house_blue.png';
import farmUrl from '../assets/buildings/house_farm.png';
import garageUrl from '../assets/buildings/house_garage.png';
import redUrl from '../assets/buildings/house_red.png';
import shedUrl from '../assets/buildings/house_shed.png';
import slateUrl from '../assets/buildings/house_slate.png';
import woodUrl from '../assets/buildings/house_wood.png';

// Домики на обочине (вид сверху): AI-картинки, вырезанные и уменьшенные до пиксель-арта.
// Набор выбирается в levels.ts (поле buildings).
const SPRITES = {
  village: {
    house_red: redUrl,
    house_wood: woodUrl,
    house_slate: slateUrl,
    house_barn: barnUrl,
    house_shed: shedUrl,
    house_farm: farmUrl,
    house_garage: garageUrl,
    house_blue: blueUrl,
  },
  desert: {
    desert_adobe: desertAdobeUrl,
    desert_gas: desertGasUrl,
    desert_motel: desertMotelUrl,
    desert_diner: desertDinerUrl,
    desert_ranch: desertRanchUrl,
    desert_tower: desertTowerUrl,
    desert_shack: desertShackUrl,
    desert_teal: desertTealUrl,
  },
  industrial: {
    ind_cabins: indCabinsUrl,
    ind_unfinished: indUnfinishedUrl,
    ind_warehouse: indWarehouseUrl,
    ind_silos: indSilosUrl,
    ind_trailer: indTrailerUrl,
    ind_materials: indMaterialsUrl,
    ind_factory: indFactoryUrl,
    ind_toilets: indToiletsUrl,
  },
};

export type BuildingSet = keyof typeof SPRITES;

export function loadBuildingAssets(scene: Phaser.Scene): void {
  for (const set of Object.values(SPRITES)) {
    for (const [key, url] of Object.entries(set)) {
      if (!scene.textures.exists(key)) scene.load.image(key, url);
    }
  }
}

/** Случайный домик из набора, но не такой же, как предыдущий на этой стороне дороги. */
export function pickBuildingKey(set: BuildingSet, previous?: string): string {
  const choices = Object.keys(SPRITES[set]).filter((key) => key !== previous);
  return Phaser.Utils.Array.GetRandom(choices);
}
