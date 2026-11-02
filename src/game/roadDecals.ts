import Phaser from 'phaser';
import crackUrl from '../assets/road/road_crack.png';
import crackLongUrl from '../assets/road/road_crack_long.png';
import cracksWebUrl from '../assets/road/road_cracks_web.png';
import drainUrl from '../assets/road/road_drain.png';
import gravelUrl from '../assets/road/road_gravel.png';
import manholeUrl from '../assets/road/road_manhole.png';
import oilUrl from '../assets/road/road_oil.png';
import patchUrl from '../assets/road/road_patch.png';
import potholeUrl from '../assets/road/road_pothole.png';
import puddleUrl from '../assets/road/road_puddle.png';
import puddleBigUrl from '../assets/road/road_puddle_big.png';
import skidUrl from '../assets/road/road_skid.png';

// Плоские детали на асфальте (лужи, трещины, люки...): только картинка, не сталкиваются.
// AI-картинка, вырезанная и уменьшенная до пиксель-арта.
const SPRITES: Record<string, string> = {
  road_puddle: puddleUrl,
  road_puddle_big: puddleBigUrl,
  road_crack: crackUrl,
  road_crack_long: crackLongUrl,
  road_cracks_web: cracksWebUrl,
  road_pothole: potholeUrl,
  road_oil: oilUrl,
  road_manhole: manholeUrl,
  road_drain: drainUrl,
  road_patch: patchUrl,
  road_skid: skidUrl,
  road_gravel: gravelUrl,
};

export function loadRoadDecalAssets(scene: Phaser.Scene): void {
  for (const [key, url] of Object.entries(SPRITES)) {
    if (!scene.textures.exists(key)) scene.load.image(key, url);
  }
}

/** Случайная деталь, но не такая же, как предыдущая. */
export function pickRoadDecalKey(previous?: string): string {
  const choices = Object.keys(SPRITES).filter((key) => key !== previous);
  return Phaser.Utils.Array.GetRandom(choices);
}
