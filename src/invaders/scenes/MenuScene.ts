import Phaser from 'phaser';
import { FIELD_W } from '../engine/InvadersEngine';
import { FONT_KEY } from '../../fx/RuntimeFont';
import { CREATURE_KEYS } from '../../fx/CreatureTextures';
import type { AudioBus } from '../../fx/AudioBus';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    const audio = this.registry.get('audio') as AudioBus;
    const cx = FIELD_W / 2;

    const logo = this.add.image(cx, 70, 'wemutate-logo');
    logo.setScale(240 / logo.width);

    this.add.bitmapText(cx, 150, FONT_KEY, 'MUTANT', 60).setOrigin(0.5).setTint(0x3fb950);
    this.add.bitmapText(cx, 210, FONT_KEY, 'INVADERS', 56).setOrigin(0.5).setTint(0x3fb950);
    this.add
      .bitmapText(cx, 272, FONT_KEY, 'shoot the mutants\ndefend the build', 20)
      .setOrigin(0.5, 0)
      .setCenterAlign()
      .setTint(0xe6edf3)
      .setLineSpacing(8);
    this.add
      .bitmapText(cx, 344, FONT_KEY, 'drag to move  -  auto-fire', 16)
      .setOrigin(0.5, 0)
      .setTint(0x8b949e);

    // A little marching row of mutants for flavour.
    const designs = [...CREATURE_KEYS, 'toothy-green', 'toothy-red'];
    designs.forEach((key, i) => {
      const s = this.add.image(70 + i * 58, 400, key);
      s.setScale(46 / s.height);
      this.tweens.add({ targets: s, y: 388, duration: 900, yoyo: true, repeat: -1, delay: i * 120, ease: 'Sine.easeInOut' });
    });

    const soundText = this.add
      .bitmapText(cx, 500, FONT_KEY, '', 22)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const renderSound = (): void => {
      soundText.setText(`SOUND: ${audio.enabled ? 'ON' : 'OFF'}  (tap)`).setTint(audio.enabled ? 0x3fb950 : 0x8b949e);
    };
    renderSound();
    soundText.on('pointerdown', () => {
      audio.setEnabled(!audio.enabled);
      renderSound();
      audio.kill();
    });

    const start = this.add
      .bitmapText(cx, 600, FONT_KEY, 'TAP TO START', 34)
      .setOrigin(0.5)
      .setTint(0xf2cc60);
    this.tweens.add({ targets: start, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    const begin = (): void => {
      this.scene.start('Game', { level: 1 });
    };
    // Tapping the sound toggle shouldn't also start the game.
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.includes(soundText)) return;
      begin();
    });
    this.input.keyboard?.on('keydown', begin);
  }
}
