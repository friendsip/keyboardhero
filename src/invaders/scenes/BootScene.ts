import Phaser from 'phaser';
import { registerRuntimeFont } from '../../fx/RuntimeFont';
import { registerCreatureTextures } from '../../fx/CreatureTextures';
import { registerShipTextures } from '../fx/ShipTextures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.image('wemutate-logo', 'assets/wemutate-glitch.png');
    this.load.image('toothy-green', 'assets/toothy-green.png');
    this.load.image('toothy-red', 'assets/toothy-red.png');
  }

  create(): void {
    registerRuntimeFont(this);
    registerCreatureTextures(this);
    registerShipTextures(this);
    this.scene.start('Menu');
  }
}
