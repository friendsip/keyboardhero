import Phaser from 'phaser';
import { FIELD_WIDTH, FIELD_HEIGHT } from '../core/TypingEngine';
import { FONT_KEY } from '../fx/RuntimeFont';

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  create(): void {
    this.add
      .rectangle(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, FIELD_WIDTH, FIELD_HEIGHT, 0x010409, 0.7)
      .setDepth(0);
    this.add
      .bitmapText(FIELD_WIDTH / 2, FIELD_HEIGHT / 2 - 20, FONT_KEY, 'PAUSED', 48)
      .setOrigin(0.5)
      .setTint(0xe6edf3);
    this.add
      .bitmapText(FIELD_WIDTH / 2, FIELD_HEIGHT / 2 + 40, FONT_KEY, 'PRESS M FOR MAIN MENU', 24)
      .setOrigin(0.5)
      .setTint(0xf2cc60);
    this.add
      .bitmapText(FIELD_WIDTH / 2, FIELD_HEIGHT / 2 + 78, FONT_KEY, 'any other key resumes', 20)
      .setOrigin(0.5)
      .setTint(0x8b949e);
  }
}
