/**
 * Entry point: bootstraps the Phaser game and registers all scenes.
 */

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from './config';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.background,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 1.2 },
      debug: false,
      // Improve resting stability for stacked cubes.
      enableSleeping: true,
      // Constrain to improve stack stability.
      constraintIterations: 4,
      positionIterations: 8,
      velocityIterations: 8
    }
  },
  input: {
    activePointers: 1,
    touch: { capture: true }
  },
  render: {
    antialias: true,
    roundPixels: true
  },
  scene: [BootScene, PreloadScene, MenuScene, GameScene, GameOverScene]
};

// Remove the loading indicator once Phaser has booted.
window.addEventListener('load', () => {
  const loading = document.getElementById('loading');
  if (loading) loading.remove();
});

new Phaser.Game(config);
