import Phaser from 'phaser';
import { FIELD_W } from '../engine/InvadersEngine';
import { FONT_KEY } from '../../fx/RuntimeFont';

interface OverData {
  won: boolean;
  level: number;
  score: number;
  kills: number;
  total: number;
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data: OverData): void {
    const cx = FIELD_W / 2;
    this.cameras.main.setBackgroundColor('#05070d');

    const title = data.won ? 'BUILD SHIPPED!' : 'BUILD OVERRUN';
    this.add.bitmapText(cx, 180, FONT_KEY, title, 34).setOrigin(0.5).setTint(data.won ? 0x3fb950 : 0xf85149);

    const mutation = data.total === 0 ? 100 : Math.round((data.kills / data.total) * 100);
    const lines = [
      `REACHED LEVEL ${data.level}`,
      `SCORE ${data.score}`,
      `MUTANTS SHOT ${data.kills}`,
      `MUTATION SCORE ${mutation}%`,
    ];
    this.add
      .bitmapText(cx, 300, FONT_KEY, lines.join('\n'), 24)
      .setOrigin(0.5, 0)
      .setCenterAlign()
      .setTint(0xe6edf3)
      .setLineSpacing(12);

    const retry = this.add.bitmapText(cx, 520, FONT_KEY, 'TAP TO RETRY', 30).setOrigin(0.5).setTint(0xf2cc60);
    this.tweens.add({ targets: retry, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    this.add.bitmapText(cx, 580, FONT_KEY, 'menu', 22).setOrigin(0.5).setTint(0x8b949e).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.scene.start('Menu');
    });

    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.scene.start('Game', { level: 1 });
    });
    this.input.keyboard?.on('keydown', () => this.scene.start('Game', { level: 1 }));
  }
}
