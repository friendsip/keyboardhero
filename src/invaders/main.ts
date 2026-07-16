import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { HUDScene } from './scenes/HUDScene';
import { GameOverScene } from './scenes/GameOverScene';
import { FIELD_W, FIELD_H } from './engine/InvadersEngine';
import { AudioBus } from '../fx/AudioBus';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: FIELD_W,
  height: FIELD_H,
  backgroundColor: '#05070d',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, GameScene, HUDScene, GameOverScene],
});

game.registry.set('audio', new AudioBus());
