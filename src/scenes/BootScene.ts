/**
 * BootScene: minimal scene that immediately hands off to PreloadScene.
 * It exists so that future platform-specific bootstrap (Capacitor plugins,
 * ads SDK init, etc.) can happen before assets are loaded.
 */

import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    this.scene.start('PreloadScene');
  }
}
