import Phaser from 'phaser';
import { FIELD_WIDTH } from '../core/TypingEngine';
import { FONT_KEY } from '../fx/RuntimeFont';
import type { AudioBus } from '../fx/AudioBus';
import type { KeyRouter } from '../input/KeyRouter';
import { MAX_LEVEL } from '../data/words/pools';

const USER_KEY = 'ttf.user';

/** Arcade-style player identity: up to three letters, persisted locally. */
export function loadUser(): string {
  try {
    const raw = (localStorage.getItem(USER_KEY) ?? '').toUpperCase();
    return /^[A-Z]{1,3}$/.test(raw) ? raw : '';
  } catch {
    return '';
  }
}

export function saveUser(initials: string): void {
  try {
    localStorage.setItem(USER_KEY, initials);
  } catch {
    /* non-fatal */
  }
}

export class MenuScene extends Phaser.Scene {
  private soundText!: Phaser.GameObjects.BitmapText;
  private levelText!: Phaser.GameObjects.BitmapText;
  private userText!: Phaser.GameObjects.BitmapText;
  private startText!: Phaser.GameObjects.BitmapText;
  private level = 1;
  private user = '';
  private editingUser = false;

  constructor() {
    super('Menu');
  }

  create(): void {
    const audio = this.registry.get('audio') as AudioBus;
    const router = this.registry.get('keyRouter') as KeyRouter;
    this.user = loadUser();
    this.editingUser = this.user === '';
    this.registry.set('user', this.user);

    const cx = FIELD_WIDTH / 2;

    const logo = this.add.image(cx, 86, 'wemutate-logo');
    logo.setScale(380 / logo.width);

    this.add
      .bitmapText(cx, 172, FONT_KEY, 'KILL THE MUTANTS', 54)
      .setOrigin(0.5)
      .setTint(0x3fb950);
    this.add
      .bitmapText(cx, 216, FONT_KEY, 'typing to freedom', 20)
      .setOrigin(0.5)
      .setTint(0x8b949e);

    const instructions = [
      'mutants are loose in the codebase',
      'type the word above a mutant to kill it',
      'your first letter locks the target - finish the word',
      'do not let them reach the BUILD',
    ];
    this.add
      .bitmapText(cx, 268, FONT_KEY, instructions.join('\n'), 20)
      .setOrigin(0.5, 0)
      .setCenterAlign()
      .setTint(0xe6edf3)
      .setLineSpacing(9);

    for (const [key, x] of [['toothy-green', 128], ['toothy-red', 1152]] as const) {
      const toothy = this.add.image(x, 592, key);
      toothy.setScale(200 / toothy.height);
      this.tweens.add({
        targets: toothy,
        y: 580,
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: key === 'toothy-red' ? 700 : 0,
      });
    }

    this.userText = this.add
      .bitmapText(cx, 452, FONT_KEY, '', 24)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.userText.on('pointerdown', () => this.startUserEdit(audio));

    this.soundText = this.add
      .bitmapText(cx, 496, FONT_KEY, '', 22)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.soundText.on('pointerdown', () => this.toggleSound());

    this.levelText = this.add.bitmapText(cx, 538, FONT_KEY, '', 19).setOrigin(0.5).setTint(0x58a6ff);

    this.startText = this.add
      .bitmapText(cx, 628, FONT_KEY, '', 28)
      .setOrigin(0.5)
      .setTint(0xf2cc60);
    this.tweens.add({ targets: this.startText, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    this.renderAll(audio.enabled);

    const handler = (char: string): void => {
      if (this.editingUser) {
        this.handleUserKey(char, audio);
        return;
      }
      if (char === ' ') {
        this.scene.start('Game', { level: this.level });
        return;
      }
      if (char.toLowerCase() === 's') {
        this.toggleSound();
        return;
      }
      if (char.toLowerCase() === 'n') {
        this.startUserEdit(audio);
        return;
      }
      const digit = Number(char);
      if (Number.isInteger(digit) && digit >= 1 && digit <= MAX_LEVEL) {
        this.level = digit;
        this.renderAll((this.registry.get('audio') as AudioBus).enabled);
        audio.click(digit);
      }
    };
    router.setHandler(handler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => router.clearHandler(handler));
  }

  private startUserEdit(audio: AudioBus): void {
    this.editingUser = true;
    this.user = '';
    this.renderAll(audio.enabled);
  }

  private handleUserKey(char: string, audio: AudioBus): void {
    if (/^[a-zA-Z]$/.test(char)) {
      this.user += char.toUpperCase();
      audio.click(this.user.length);
      if (this.user.length >= 3) this.commitUser();
    } else if (char === ' ' && this.user.length > 0) {
      this.commitUser();
    }
    this.renderAll(audio.enabled);
  }

  private commitUser(): void {
    this.editingUser = false;
    saveUser(this.user);
    this.registry.set('user', this.user);
  }

  private toggleSound(): void {
    const audio = this.registry.get('audio') as AudioBus;
    audio.setEnabled(!audio.enabled);
    this.renderAll(audio.enabled);
    audio.kill(); // audible confirmation when switching on
  }

  private renderAll(soundOn: boolean): void {
    if (this.editingUser) {
      const slots = (this.user + '___').slice(0, 3).split('').join(' ');
      this.userText.setText(`ENTER YOUR INITIALS: ${slots}`).setTint(0xf2cc60);
      this.startText.setText('TYPE UP TO 3 LETTERS');
    } else {
      this.userText.setText(`PLAYER: ${this.user || '???'}  (press N or click to change)`).setTint(0x3fb950);
      this.startText.setText('PRESS SPACE TO START');
    }
    this.soundText.setText(`SOUND: ${soundOn ? 'ON ' : 'OFF'}  (press S or click)`);
    this.soundText.setTint(soundOn ? 0x3fb950 : 0x8b949e);
    const desc = ['', '2-letter words', '3-letter words', '4-letter words', '5-letter words', '6-7 letter words', 'long words'][this.level];
    this.levelText.setText(`LEVEL ${this.level} OF ${MAX_LEVEL} - ${desc}  (press 1-${MAX_LEVEL})`);
  }
}
