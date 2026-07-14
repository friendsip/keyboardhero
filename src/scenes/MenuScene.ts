import Phaser from 'phaser';
import { FIELD_WIDTH } from '../core/TypingEngine';
import { FONT_KEY } from '../fx/RuntimeFont';
import type { AudioBus } from '../fx/AudioBus';
import type { KeyRouter } from '../input/KeyRouter';
import { MAX_LEVEL } from '../data/words/pools';

const USER_KEY = 'ttf.user';
const NAME_LENGTH = 5;
/** The 32 punctuation/symbol marks on a standard keyboard (ASCII punctuation). */
const SYMBOLS = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
const ALNUM = /^[a-zA-Z0-9]$/;

function isMutatedName(name: string): boolean {
  if (name.length !== NAME_LENGTH) return false;
  let symbols = 0;
  for (const ch of name) {
    if (SYMBOLS.includes(ch)) symbols++;
    else if (!ALNUM.test(ch)) return false;
  }
  return symbols === 1;
}

/** A mutated 5-char username, persisted locally once a game starts. */
export function loadUser(): string {
  try {
    const raw = localStorage.getItem(USER_KEY) ?? '';
    return isMutatedName(raw) ? raw : '';
  } catch {
    return '';
  }
}

export function saveUser(name: string): void {
  try {
    localStorage.setItem(USER_KEY, name);
  } catch {
    /* non-fatal */
  }
}

function mutateName(base: string, avoidPos: number | null): { name: string; pos: number } {
  let pos = Math.floor(Math.random() * base.length);
  while (base.length > 1 && pos === avoidPos) {
    pos = Math.floor(Math.random() * base.length);
  }
  const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)] ?? '?';
  return { name: base.slice(0, pos) + symbol + base.slice(pos + 1), pos };
}

type UserState = 'display' | 'editing' | 'mutated';

export class MenuScene extends Phaser.Scene {
  private soundText!: Phaser.GameObjects.BitmapText;
  private userText!: Phaser.GameObjects.BitmapText;
  private fixText!: Phaser.GameObjects.BitmapText;
  private startText!: Phaser.GameObjects.BitmapText;
  private level = 1;
  private userState: UserState = 'display';
  private baseName = '';
  private mutatedName = '';
  private mutatedPos: number | null = null;

  constructor() {
    super('Menu');
  }

  create(): void {
    const audio = this.registry.get('audio') as AudioBus;
    const router = this.registry.get('keyRouter') as KeyRouter;

    this.mutatedName = loadUser();
    this.userState = this.mutatedName === '' ? 'editing' : 'display';
    this.baseName = '';
    this.mutatedPos = null;
    this.registry.set('user', this.mutatedName);

    const cx = FIELD_WIDTH / 2;

    const logo = this.add.image(cx, 44, 'wemutate-logo-w3');
    logo.setScale(190 / logo.width);

    const title = this.add.image(cx, 210, 'night-title');
    title.setScale(290 / title.height);

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
      .bitmapText(cx, 420, FONT_KEY, '', 24)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.userText.on('pointerdown', () => this.startUserEdit());

    this.fixText = this.add
      .bitmapText(cx, 458, FONT_KEY, '[ MUTATE AGAIN ]', 20)
      .setOrigin(0.5)
      .setTint(0xf2cc60)
      .setInteractive({ useHandCursor: true });
    this.fixText.on('pointerdown', () => this.fixUsername());

    this.soundText = this.add
      .bitmapText(cx, 500, FONT_KEY, '', 20)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.soundText.on('pointerdown', () => this.toggleSound());

    const howText = this.add
      .bitmapText(cx, 536, FONT_KEY, 'HOW TO PLAY  (press H or click)', 20)
      .setOrigin(0.5)
      .setTint(0x58a6ff)
      .setInteractive({ useHandCursor: true });
    howText.on('pointerdown', () => this.scene.start('HowTo'));

    this.startText = this.add
      .bitmapText(cx, 660, FONT_KEY, '', 21)
      .setOrigin(0.5)
      .setTint(0xf2cc60);
    this.tweens.add({ targets: this.startText, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    this.renderAll(audio.enabled);

    const handler = (char: string): void => {
      if (this.userState === 'editing') {
        this.handleEditKey(char, audio);
        return;
      }
      if (this.userState === 'mutated') {
        if (char === ' ') {
          this.commitAndStart();
        } else if (char.toLowerCase() === 'm' || char.toLowerCase() === 'f') {
          this.fixUsername();
        }
        return;
      }
      // display state: normal menu controls
      if (char === ' ') {
        this.scene.start('Game', { level: this.level });
        return;
      }
      if (char.toLowerCase() === 's') {
        this.toggleSound();
        return;
      }
      if (char.toLowerCase() === 'n') {
        this.startUserEdit();
        return;
      }
      if (char.toLowerCase() === 'h') {
        this.scene.start('HowTo');
        return;
      }
      const digit = Number(char);
      if (Number.isInteger(digit) && digit >= 1 && digit <= MAX_LEVEL) {
        this.level = digit;
        this.renderAll(audio.enabled);
        audio.click(digit);
      }
    };
    router.setHandler(handler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => router.clearHandler(handler));
  }

  private handleEditKey(char: string, audio: AudioBus): void {
    if (ALNUM.test(char) && this.baseName.length < NAME_LENGTH) {
      this.baseName += char;
      audio.click(this.baseName.length);
    } else if (char === '\n') {
      if (this.baseName.length === NAME_LENGTH) {
        const { name, pos } = mutateName(this.baseName, null);
        this.mutatedName = name;
        this.mutatedPos = pos;
        this.userState = 'mutated';
        audio.kill();
      } else {
        audio.miss();
      }
    }
    this.renderAll(audio.enabled);
  }

  private startUserEdit(): void {
    this.userState = 'editing';
    this.baseName = '';
    this.mutatedPos = null;
    this.renderAll((this.registry.get('audio') as AudioBus).enabled);
  }

  private fixUsername(): void {
    if (this.userState !== 'mutated') return;
    const { name, pos } = mutateName(this.baseName, this.mutatedPos);
    this.mutatedName = name;
    this.mutatedPos = pos;
    (this.registry.get('audio') as AudioBus).kill();
    this.renderAll((this.registry.get('audio') as AudioBus).enabled);
  }

  private commitAndStart(): void {
    saveUser(this.mutatedName);
    this.registry.set('user', this.mutatedName);
    this.scene.start('Game', { level: this.level });
  }

  private toggleSound(): void {
    const audio = this.registry.get('audio') as AudioBus;
    audio.setEnabled(!audio.enabled);
    this.renderAll(audio.enabled);
    audio.kill(); // audible confirmation when switching on
  }

  private renderAll(soundOn: boolean): void {
    this.fixText.setVisible(this.userState === 'mutated');
    if (this.userState === 'editing') {
      const slots = (this.baseName + '_'.repeat(NAME_LENGTH)).slice(0, NAME_LENGTH).split('').join(' ');
      this.userText.setText(`SET YOUR USERNAME: ${slots}`).setTint(0xf2cc60);
      this.startText.setText('SET USERNAME AND PRESS ENTER');
    } else if (this.userState === 'mutated') {
      this.userText.setText(`YOUR USERNAME HAS BEEN MUTATED TO: ${this.mutatedName}`).setTint(0x3fb950);
      this.startText.setText('PRESS SPACE TO START');
    } else {
      this.userText.setText(`PLAYER: ${this.mutatedName || '?????'}  (press N or click to change)`).setTint(0x3fb950);
      this.startText.setText('PRESS SPACE TO START');
    }
    this.soundText.setText(`SOUND: ${soundOn ? 'ON ' : 'OFF'}  (press S or click)`);
    this.soundText.setTint(soundOn ? 0x3fb950 : 0x8b949e);
  }
}
