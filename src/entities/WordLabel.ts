import Phaser from 'phaser';
import { FONT_KEY } from '../fx/RuntimeFont';

const TYPED_COLOR = 0x2ea043;
const NEXT_COLOR = 0xf2cc60;
const REMAINING_COLOR = 0x9198a1;

export class WordLabel {
  readonly text: Phaser.GameObjects.BitmapText;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add
      .bitmapText(0, 0, FONT_KEY, '', 22)
      .setOrigin(0.5, 1)
      .setDepth(10);
  }

  setWord(word: string): void {
    // Spaces render as '_' so passphrase gaps stay visible; the engine still
    // expects the real space character.
    this.text.setText(word.replace(/ /g, '_'));
    this.applyTints(0);
  }

  setProgress(progress: number): void {
    this.applyTints(progress);
  }

  setPosition(x: number, y: number): void {
    this.text.setPosition(Math.round(x), Math.round(y));
  }

  setFontSize(size: number): void {
    if (this.text.fontSize !== size) this.text.setFontSize(size);
  }

  setActivePooled(active: boolean): void {
    this.text.setActive(active).setVisible(active);
  }

  private applyTints(progress: number): void {
    const length = this.text.text.length;
    if (progress > 0) this.text.setCharacterTint(0, progress, true, TYPED_COLOR);
    if (progress < length) this.text.setCharacterTint(progress, 1, true, NEXT_COLOR);
    if (progress + 1 < length) this.text.setCharacterTint(progress + 1, -1, true, REMAINING_COLOR);
  }
}
