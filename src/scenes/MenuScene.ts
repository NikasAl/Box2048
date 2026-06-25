/**
 * MenuScene: title screen with "Play" button, best-score display,
 * and a language toggle (RU/EN).
 */

import Phaser from 'phaser';
import { COLORS, STORAGE_KEYS } from '../config';
import { AdsManager } from '../ads/AdsManager';
import { i18n, type Language } from '../systems/I18n';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.background);

    // Title
    const title = this.add.text(width / 2, height * 0.26, i18n.t('menu.title'), {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '64px',
      color: '#ffffff'
    });
    title.setOrigin(0.5);
    title.setStroke(COLORS.accent.toString(16).padStart(6, '0'), 4);

    // Subtitle
    this.add
      .text(width / 2, height * 0.26 + 60, i18n.t('menu.subtitle'), {
        fontFamily: 'Arial, sans-serif',
        fontSize: '22px',
        color: '#8a8aa8'
      })
      .setOrigin(0.5);

    // Best score
    const best = Number(localStorage.getItem(STORAGE_KEYS.bestScore) ?? 0);
    this.add
      .text(width / 2, height * 0.43, i18n.t('menu.best', { score: best }), {
        fontFamily: 'Arial, sans-serif',
        fontSize: '28px',
        color: '#e94560'
      })
      .setOrigin(0.5);

    // Play button
    this.makePrimaryButton(width / 2, height * 0.58, i18n.t('menu.play'), () => {
      this.scene.start('GameScene');
    });

    // Footer hint
    this.add
      .text(width / 2, height - 80, i18n.t('menu.hint'), {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        color: '#5a5a78'
      })
      .setOrigin(0.5);

    // Language toggle (bottom of screen)
    this.makeLanguageToggle(width / 2, height - 40);

    // Initialize ads in the background.
    AdsManager.getInstance()
      .init()
      .catch((err) => console.warn('[Ads] init failed:', err));
  }

  private makePrimaryButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void
  ): void {
    const w = 220;
    const h = 70;
    const container = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.buttonPrimary, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 16);
    bg.setInteractive(
      new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
      Phaser.Geom.Rectangle.Contains
    );
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: '32px',
        color: '#ffffff'
      })
      .setOrigin(0.5);
    container.add([bg, text]);

    bg.on('pointerup', onClick);
    bg.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(COLORS.buttonPrimaryHover, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 16);
    });
    bg.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(COLORS.buttonPrimary, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 16);
    });
  }

  /**
   * Two-segment toggle: [ RU | EN ]. Clicking the inactive segment switches
   * the language and re-renders the menu.
   */
  private makeLanguageToggle(x: number, y: number): void {
    const segW = 60;
    const segH = 32;
    const gap = 4;

    const container = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(0x2a2a44, 1);
    bg.fillRoundedRect(-(segW * 2 + gap) / 2, -segH / 2, segW * 2 + gap, segH, 8);

    const segRu = this.add.graphics();
    const segEn = this.add.graphics();

    const labelRu = this.add
      .text(-segW / 2 - gap / 2, 0, 'RU', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#ffffff'
      })
      .setOrigin(0.5);
    const labelEn = this.add
      .text(segW / 2 + gap / 2, 0, 'EN', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#ffffff'
      })
      .setOrigin(0.5);

    container.add([bg, segRu, segEn, labelRu, labelEn]);

    const redraw = () => {
      const current = i18n.getLanguage();
      // RU segment
      segRu.clear();
      segRu.fillStyle(current === 'ru' ? COLORS.accent : 0x3a3a5a, 1);
      segRu.fillRoundedRect(-segW - gap / 2, -segH / 2 + 2, segW, segH - 4, 6);
      // EN segment
      segEn.clear();
      segEn.fillStyle(current === 'en' ? COLORS.accent : 0x3a3a5a, 1);
      segEn.fillRoundedRect(-gap / 2, -segH / 2 + 2, segW, segH - 4, 6);
    };

    segRu.setInteractive(
      new Phaser.Geom.Rectangle(-segW - gap / 2, -segH / 2 + 2, segW, segH - 4),
      Phaser.Geom.Rectangle.Contains
    );
    segEn.setInteractive(
      new Phaser.Geom.Rectangle(-gap / 2, -segH / 2 + 2, segW, segH - 4),
      Phaser.Geom.Rectangle.Contains
    );

    segRu.on('pointerup', () => {
      if (i18n.getLanguage() !== 'ru') {
        i18n.setLanguage('ru' as Language);
        // Re-create the whole menu so all text re-renders.
        this.scene.restart();
      }
    });
    segEn.on('pointerup', () => {
      if (i18n.getLanguage() !== 'en') {
        i18n.setLanguage('en' as Language);
        this.scene.restart();
      }
    });

    redraw();
  }
}
