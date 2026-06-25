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
import { MilestoneScene } from './scenes/MilestoneScene';

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
      // Sleeping DISABLED. With sleeping enabled, cubes that come to rest
      // don't wake up reliably when another cube lands on them or pushes
      // them — they freeze in unstable positions and never roll off.
      // For a small field with <50 cubes, the perf cost is negligible.
      enableSleeping: false,
      // Higher iteration counts = more stable stacking.
      constraintIterations: 6,
      positionIterations: 10,
      velocityIterations: 10
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
  scene: [BootScene, PreloadScene, MenuScene, GameScene, GameOverScene, MilestoneScene]
};

// Remove the loading indicator once Phaser has booted.
window.addEventListener('load', () => {
  const loading = document.getElementById('loading');
  if (loading) loading.remove();
});

new Phaser.Game(config);
