import Phaser from 'phaser';
import { FIELD_WIDTH } from '../core/TypingEngine';
import { FONT_KEY } from '../fx/RuntimeFont';
import type { KeyRouter } from '../input/KeyRouter';

export class HowToScene extends Phaser.Scene {
  constructor() {
    super('HowTo');
  }

  create(): void {
    const router = this.registry.get('keyRouter') as KeyRouter;
    const cx = FIELD_WIDTH / 2;

    const logo = this.add.image(cx, 70, 'wemutate-logo');
    logo.setScale(300 / logo.width);

    this.add
      .bitmapText(cx, 150, FONT_KEY, 'HOW TO PLAY', 44)
      .setOrigin(0.5)
      .setTint(0x3fb950);

    const lines = [
      'mutants are loose in the codebase',
      'type the word above a mutant to kill it',
      'your first letter locks the target - finish the word',
      'misses break your combo',
      'do not let mutants reach the BUILD',
      '',
      'each level ends with a BOSS carrying a whole sentence',
      'kill it before the timer runs out - _ means the space bar',
      '',
      'on the menu: press 1-6 to pick a level (word length,',
      '2 letters up to long words), S toggles sound',
    ];
    this.add
      .bitmapText(cx, 200, FONT_KEY, lines.join('\n'), 19)
      .setOrigin(0.5, 0)
      .setCenterAlign()
      .setTint(0xe6edf3)
      .setLineSpacing(4);

    const back = this.add
      .bitmapText(cx, 682, FONT_KEY, 'PRESS ANY KEY OR CLICK TO GO BACK', 22)
      .setOrigin(0.5)
      .setTint(0xf2cc60);
    this.tweens.add({ targets: back, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    const goBack = (): void => {
      this.scene.start('Menu');
    };
    this.input.once('pointerdown', goBack);
    const handler = (): void => goBack();
    router.setHandler(handler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => router.clearHandler(handler));
  }
}
