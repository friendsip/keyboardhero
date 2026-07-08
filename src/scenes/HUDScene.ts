import Phaser from 'phaser';
import type { TypingEngine } from '../core/TypingEngine';
import { FONT_KEY } from '../fx/RuntimeFont';

export class HUDScene extends Phaser.Scene {
  private wpmText!: Phaser.GameObjects.BitmapText;
  private accText!: Phaser.GameObjects.BitmapText;
  private comboText!: Phaser.GameObjects.BitmapText;
  private scoreText!: Phaser.GameObjects.BitmapText;
  private integrityText!: Phaser.GameObjects.BitmapText;
  private threatsText!: Phaser.GameObjects.BitmapText;
  private railText!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('HUD');
  }

  create(): void {
    this.wpmText = this.add.bitmapText(24, 16, FONT_KEY, 'WPM --', 26).setTint(0x58a6ff);
    this.accText = this.add.bitmapText(24, 52, FONT_KEY, 'ACC 100.0%', 20).setTint(0x9198a1);
    this.comboText = this.add.bitmapText(24, 82, FONT_KEY, '', 20).setTint(0xf2cc60);
    this.scoreText = this.add
      .bitmapText(1256, 16, FONT_KEY, 'SCORE 0', 26)
      .setOrigin(1, 0)
      .setTint(0xe6edf3);
    this.threatsText = this.add
      .bitmapText(1256, 52, FONT_KEY, '', 20)
      .setOrigin(1, 0)
      .setTint(0x9198a1);
    this.railText = this.add
      .bitmapText(1256, 82, FONT_KEY, '', 20)
      .setOrigin(1, 0)
      .setTint(0x58a6ff);
    this.integrityText = this.add
      .bitmapText(640, 690, FONT_KEY, '', 22)
      .setOrigin(0.5)
      .setTint(0x3fb950);
  }

  override update(): void {
    const engine = this.registry.get('engine') as TypingEngine | undefined;
    if (!engine) return;
    const snap = engine.snapshot();
    const wpm = engine.rollingWpm();

    this.wpmText.setText(`WPM ${wpm === null ? '--' : String(Math.round(wpm))}`);
    this.accText.setText(`ACC ${(engine.accuracy() * 100).toFixed(1)}%`);
    this.comboText.setText(snap.combo > 0 ? `COMBO ${snap.combo}  x${snap.comboMult}` : '');
    this.scoreText.setText(`SCORE ${snap.score}`);
    this.threatsText.setText(`MUTANTS ${snap.mutantsRemaining}`);
    this.railText.setText(`RAIL ${Math.min(snap.segIndex + 1, snap.segmentCount)}/${snap.segmentCount}`);
    this.integrityText.setText(`BUILD ${'#'.repeat(Math.max(snap.integrity, 0))}`);
    this.integrityText.setTint(snap.integrity <= 2 ? 0xf85149 : 0x3fb950);
  }
}
