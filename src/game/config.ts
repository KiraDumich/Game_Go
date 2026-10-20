import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { ShopScene } from './ShopScene';

export function createGame(parent: string): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 640,
    backgroundColor: '#1a1c2c',
    pixelArt: true, // без сглаживания — чёткие пиксели
    roundPixels: true, // рисовать по целым пикселям: края не дрожат при движении
    scene: [ShopScene, GameScene], // первой запускается гараж
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };

  return new Phaser.Game(config);
}
