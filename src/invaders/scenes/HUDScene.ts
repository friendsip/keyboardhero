import Phaser from 'phaser';
import type { InvadersEngine } from '../engine/InvadersEngine';
import { FIELD_W } from '../engine/InvadersEngine';
import { FONT_KEY } from '../../fx/RuntimeFont';

const SIZE = 20;
const COLOR = 0xe6edf3;

export class HUDScene extends Phaser.Scene {
  private scoreText!: Phaser.GameObjects.BitmapText;
  private leftText!: Phaser.GameObjects.BitmapText;
  private lvlText!: Phaser.GameObjects.BitmapText;
  private buildText!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('HUD');
  }

  create(): void {
    this.scoreText = this.add.bitmapText(12, 10, FONT_KEY, '', SIZE).setTint(COLOR);
    this.leftText = this.add.bitmapText(12, 36, FONT_KEY, '', SIZE).setTint(COLOR);
    this.lvlText = this.add.bitmapText(FIELD_W - 12, 10, FONT_KEY, '', SIZE).setOrigin(1, 0).setTint(COLOR);
    this.buildText = this.add.bitmapText(FIELD_W - 12, 36, FONT_KEY, '', SIZE).setOrigin(1, 0).setTint(COLOR);
  }

  override update(): void {
    const engine = this.registry.get('engine') as InvadersEngine | undefined;
    if (!engine) return;
    const snap = engine.snapshot();
    const carryScore = (this.registry.get('carryScore') as number | undefined) ?? 0;
    const level = (this.registry.get('level') as number | undefined) ?? 1;
    this.scoreText.setText(`SCORE ${carryScore + snap.score}`);
    this.leftText.setText(`LEFT ${snap.mutants.length}`);
    this.lvlText.setText(`LVL ${level}`);
    this.buildText.setText(`BUILD ${'#'.repeat(Math.max(snap.integrity, 0))}`);
  }
}
