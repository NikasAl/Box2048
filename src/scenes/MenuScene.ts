/**
 * MenuScene: title screen with "Play" and "Best score" display.
 * Also initializes the Ads SDK here (one-time, async).
 */

import Phaser from 'phaser';
import { COLORS, STORAGE_KEYS } from '../config';
import { AdsManager } from '../ads/AdsManager';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // Background
    this.cameras.main.setBackgroundColor(COLORS.background);

    // Title
    const title = this.add.text(width / 2, height * 0.28, 'BOX 2048', {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '64px',
      color: '#ffffff'
    });
    title.setOrigin(0.5);
    title.setStroke(COLORS.accent.toString(16).padStart(6, '0'), 4);

    // Subtitle
    this.add
      .text(width / 2, height * 0.28 + 60, 'drop · merge · survive', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '22px',
        color: '#8a8aa8'
      })
      .setOrigin(0.5);

    // Best score
    const best = Number(localStorage.getItem(STORAGE_KEYS.bestScore) ?? 0);
    this.add
      .text(width / 2, height * 0.45, `Best: ${best}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '28px',
        color: '#e94560'
      })
      .setOrigin(0.5);

    // Play button
    const playBtn = this.add.container(width / 2, height * 0.6);
    const btnBg = this.add.graphics();
    const btnW = 220;
    const btnH = 70;
    btnBg.fillStyle(COLORS.buttonPrimary, 1);
    btnBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 16);
    btnBg.setInteractive(
      new Phaser.Geom.Rectangle(-btnW / 2, -btnH / 2, btnW, btnH),
      Phaser.Geom.Rectangle.Contains
    );
    const btnText = this.add
      .text(0, 0, 'PLAY', {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: '32px',
        color: '#ffffff'
      })
      .setOrigin(0.5);
    playBtn.add([btnBg, btnText]);

    btnBg.on('pointerup', () => {
      this.scene.start('GameScene');
    });
    btnBg.on('pointerover', () => {
      btnBg.clear();
      btnBg.fillStyle(COLORS.buttonPrimaryHover, 1);
      btnBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 16);
    });
    btnBg.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(COLORS.buttonPrimary, 1);
      btnBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 16);
    });

    // Footer
    this.add
      .text(width / 2, height - 40, 'tap anywhere to throw the cube', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        color: '#5a5a78'
      })
      .setOrigin(0.5);

    // Initialize ads in the background. Errors are swallowed — the game
    // is fully playable without ads.
    AdsManager.getInstance()
      .init()
      .catch((err) => console.warn('[Ads] init failed:', err));
  }
}
