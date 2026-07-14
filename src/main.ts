import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { HowToScene } from './scenes/HowToScene';
import { GameScene } from './scenes/GameScene';
import { HUDScene } from './scenes/HUDScene';
import { PauseScene } from './scenes/PauseScene';
import { KeyRouter } from './input/KeyRouter';
import { AudioBus } from './fx/AudioBus';

const router = new KeyRouter();
router.attach();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#0d1117',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  dom: { createContainer: true },
  // Resolve asset URLs against the build base so PNGs load whether the game is
  // served standalone or bundled under the website's /game/ mount.
  loader: { baseURL: import.meta.env.BASE_URL },
  scene: [BootScene, MenuScene, HowToScene, GameScene, HUDScene, PauseScene],
});

game.registry.set('keyRouter', router);
game.registry.set('audio', new AudioBus());
