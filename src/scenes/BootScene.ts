import Phaser from 'phaser';
import { registerRuntimeFont } from '../fx/RuntimeFont';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    registerRuntimeFont(this);
    this.scene.start('Game');
  }
}
