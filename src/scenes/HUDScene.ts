import Phaser from 'phaser';
import type { TypingEngine } from '../core/TypingEngine';
import { FONT_KEY } from '../fx/RuntimeFont';
import { aggregateWpm, aggregateAccuracy } from '../core/runStats';

// One size, one colour, one font for every stat readout.
const HUD_SIZE = 22;
const HUD_COLOR = 0xe6edf3;
const ROW = 30;

export class HUDScene extends Phaser.Scene {
  private wpmText!: Phaser.GameObjects.BitmapText;
  private accText!: Phaser.GameObjects.BitmapText;
  private comboText!: Phaser.GameObjects.BitmapText;
  private playerText!: Phaser.GameObjects.BitmapText;
  private scoreText!: Phaser.GameObjects.BitmapText;
  private buildText!: Phaser.GameObjects.BitmapText;
  private threatsText!: Phaser.GameObjects.BitmapText;
  private railText!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('HUD');
  }

  private stat(x: number, row: number, originX: 0 | 1): Phaser.GameObjects.BitmapText {
    return this.add
      .bitmapText(x, 16 + row * ROW, FONT_KEY, '', HUD_SIZE)
      .setOrigin(originX, 0)
      .setTint(HUD_COLOR);
  }

  create(): void {
    const logo = this.add.image(640, 26, 'wemutate-logo').setAlpha(0.9);
    logo.setScale(150 / logo.width);

    this.wpmText = this.stat(24, 0, 0);
    this.accText = this.stat(24, 1, 0);
    this.comboText = this.stat(24, 2, 0);
    this.playerText = this.stat(24, 3, 0);

    this.scoreText = this.stat(1256, 0, 1);
    this.buildText = this.stat(1256, 1, 1);
    this.threatsText = this.stat(1256, 2, 1);
    this.railText = this.stat(1256, 3, 1);
  }

  override update(): void {
    const engine = this.registry.get('engine') as TypingEngine | undefined;
    if (!engine) return;
    const snap = engine.snapshot();
    const carryScore = (this.registry.get('carryScore') as number | undefined) ?? 0;
    const level = (this.registry.get('level') as number | undefined) ?? 1;

    // Run-wide aggregate: this level's live counts on top of carried totals.
    const r = engine.stats.raw();
    const totals = {
      correct: ((this.registry.get('carryCorrect') as number | undefined) ?? 0) + r.correct,
      missed: ((this.registry.get('carryMissed') as number | undefined) ?? 0) + r.missed,
      activeMs: ((this.registry.get('carryActiveMs') as number | undefined) ?? 0) + r.activeMs,
    };
    const wpm = aggregateWpm(totals);

    this.wpmText.setText(`WPM ${wpm === null ? '--' : String(Math.round(wpm))}`);
    this.accText.setText(`ACC ${(aggregateAccuracy(totals) * 100).toFixed(1)}%`);
    this.comboText.setText(snap.combo > 0 ? `COMBO ${snap.combo}  x${snap.comboMult}` : '');
    this.playerText.setText(`PLAYER ${(this.registry.get('user') as string) || '???'}`);

    this.scoreText.setText(`SCORE ${carryScore + snap.score}`);
    this.buildText.setText(`BUILD ${'#'.repeat(Math.max(snap.integrity, 0))}`);
    this.threatsText.setText(`MUTANTS ${snap.mutantsRemaining}`);
    this.railText.setText(
      `LVL ${level}  RAIL ${Math.min(snap.segIndex + 1, snap.segmentCount)}/${snap.segmentCount}`,
    );
  }
}
