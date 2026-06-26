/**
 * MilestoneScene: overlay scene shown when the player creates a cube of a
 * milestone value (32, 64, 128, ...) for the first time in this playthrough.
 *
 * It runs on top of GameScene (which is paused but not stopped), shows a
 * congratulation dialog with the cube preview, and on tap dismisses to
 * trigger the interstitial ad.
 *
 * Data passed in via init():
 *   - value: the cube value that triggered the milestone (e.g. 128)
 */

import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config';
import { i18n } from '../systems/I18n';
import { AdsManager } from '../ads/AdsManager';

interface MilestoneData {
  value: number;
}

export class MilestoneScene extends Phaser.Scene {
  private milestoneData!: MilestoneData;

  constructor() {
    super({ key: 'MilestoneScene' });
  }

  init(data: MilestoneData): void {
    this.milestoneData = data;
  }

  create(): void {
    const { width, height } = this.scale;

    // Dim overlay (semi-transparent so the field is still visible behind).
    this.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0);

    // Dialog panel
    const panelW = 380;
    const panelH = 360;
    const panelX = (width - panelW) / 2;
    const panelY = (height - panelH) / 2;
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.field, 1);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 20);
    panel.lineStyle(3, COLORS.accent, 1);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, 20);

    const cx = width / 2;
    const topY = panelY + 50;

    // Title
    this.add
      .text(cx, topY, i18n.t('milestone.title'), {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: '30px',
        color: '#edc850',
        align: 'center'
      })
      .setOrigin(0.5);

    // Cube preview (drawn using the cube-<value> texture generated in PreloadScene)
    const cubeTexture = this.textures.exists(`cube-${this.milestoneData.value}`)
      ? `cube-${this.milestoneData.value}`
      : 'cube-2';
    const cubeImg = this.add.image(cx, topY + 100, cubeTexture);
    // Pop-in animation
    cubeImg.setScale(0);
    this.tweens.add({
      targets: cubeImg,
      scale: 1,
      duration: 350,
      ease: 'Back.out'
    });
    // Subtle floating after pop
    this.tweens.add({
      targets: cubeImg,
      y: topY + 100 - 8,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut'
    });

    // Message
    this.add
      .text(
        cx,
        topY + 200,
        i18n.t('milestone.reached', { value: this.milestoneData.value }),
        {
          fontFamily: 'Arial, sans-serif',
          fontSize: '22px',
          color: '#ffffff',
          align: 'center'
        }
      )
      .setOrigin(0.5);

    // Continue button
    const btnW = 220;
    const btnH = 56;
    const btnY = panelY + panelH - 50;
    const btnBg = this.add.graphics();
    btnBg.fillStyle(COLORS.buttonPrimary, 1);
    btnBg.fillRoundedRect(cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 14);
    btnBg.setInteractive(
      new Phaser.Geom.Rectangle(cx - btnW / 2, btnY - btnH / 2, btnW, btnH),
      Phaser.Geom.Rectangle.Contains
    );
    this.add
      .text(cx, btnY, i18n.t('milestone.continue'), {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: '20px',
        color: '#ffffff'
      })
      .setOrigin(0.5);

    // "Tap to continue" hint below the panel
    this.add
      .text(width / 2, panelY + panelH + 28, i18n.t('milestone.tapToContinue'), {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        color: '#8a8aa8'
      })
      .setOrigin(0.5);

    // Continue action: dismiss the dialog, resume the game, then fire
    // interstitial (if native).
    const dismiss = () => {
      // Resume the underlying GameScene.
      const gameScene = this.scene.get('GameScene') as any;
      if (gameScene && typeof gameScene.resumeFromMilestone === 'function') {
        gameScene.resumeFromMilestone();
      } else if (this.scene.isActive('GameScene')) {
        this.scene.resume('GameScene');
      }
      this.scene.stop();

      // Show interstitial after the dialog closes (Yandex policy: don't show
      // interstitials while the user is mid-interaction).
      AdsManager.getInstance()
        .maybeShowInterstitialOnMilestone()
        .catch(() => {});
    };

    btnBg.on('pointerup', dismiss);
    // NOTE: previously we also bound this.input.on('pointerdown', dismiss)
    // so the dialog could be closed by tapping anywhere. Removed because
    // a series of fast taps (from the gameplay just before the milestone)
    // would leak through and dismiss the dialog immediately — preventing
    // the interstitial from ever being shown. Now the only way to close
    // the dialog is to click the "Continue" button explicitly.

    // Pause the underlying GameScene while the dialog is up.
    if (this.scene.isActive('GameScene')) {
      this.scene.pause('GameScene');
    }
  }
}
