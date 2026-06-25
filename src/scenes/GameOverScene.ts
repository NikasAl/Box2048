/**
 * GameOverScene: shows the final score, offers "Play again" (free) and
 * "Revive" (rewarded ad — clears top cubes and continues).
 */

import Phaser from 'phaser';
import { COLORS, STORAGE_KEYS } from '../config';
import { AdsManager } from '../ads/AdsManager';
import { i18n } from '../systems/I18n';

interface GameOverData {
  score: number;
  best: number;
  isRecord: boolean;
}

export class GameOverScene extends Phaser.Scene {
  private gameOverData!: GameOverData;

  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data: GameOverData): void {
    this.gameOverData = data;
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.background);
    // Dim overlay
    this.add.rectangle(0, 0, width, height, 0x000000, 0.5).setOrigin(0);

    // Title
    this.add
      .text(width / 2, height * 0.25, i18n.t('gameover.title'), {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: '52px',
        color: '#e94560'
      })
      .setOrigin(0.5);

    // Score
    this.add
      .text(width / 2, height * 0.4, i18n.t('gameover.score'), {
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        color: '#8a8aa8'
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.45, String(this.gameOverData.score), {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: '64px',
        color: '#ffffff'
      })
      .setOrigin(0.5);

    // Best
    this.add
      .text(
        width / 2,
        height * 0.54,
        i18n.t('gameover.best', { score: this.gameOverData.best }),
        {
          fontFamily: 'Arial, sans-serif',
          fontSize: '22px',
          color: '#e94560'
        }
      )
      .setOrigin(0.5);

    if (this.gameOverData.isRecord) {
      this.add
        .text(width / 2, height * 0.6, i18n.t('gameover.newRecord'), {
          fontFamily: 'Arial Black, Arial, sans-serif',
          fontSize: '24px',
          color: '#edc850'
        })
        .setOrigin(0.5);
    }

    // Revive button (rewarded ad)
    const reviveBtn = this.makeButton(
      width / 2,
      height * 0.72,
      i18n.t('gameover.revive'),
      0x0f3460,
      async () => {
        reviveBtn.disable();
        const ok = await AdsManager.getInstance()
          .showRewarded()
          .catch(() => false);
        if (ok) {
          this.scene.start('GameScene');
        } else {
          reviveBtn.enable();
        }
      }
    );

    // Play again (free)
    this.makeButton(
      width / 2,
      height * 0.84,
      i18n.t('gameover.playAgain'),
      COLORS.buttonPrimary,
      () => {
        this.scene.start('GameScene');
      }
    );

    // Menu
    this.add
      .text(width / 2, height - 40, i18n.t('gameover.menu'), {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#8a8aa8'
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        this.scene.start('MenuScene');
      });

    // Sanity: ensure best is persisted (in case GameScene didn't).
    const storedBest = Number(localStorage.getItem(STORAGE_KEYS.bestScore) ?? 0);
    if (this.gameOverData.best > storedBest) {
      localStorage.setItem(STORAGE_KEYS.bestScore, String(this.gameOverData.best));
    }
  }

  private makeButton(
    x: number,
    y: number,
    label: string,
    color: number,
    onClick: () => void
  ): { enable: () => void; disable: () => void } {
    const w = 260;
    const h = 60;
    const container = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    bg.setInteractive(
      new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
      Phaser.Geom.Rectangle.Contains
    );
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: '22px',
        color: '#ffffff'
      })
      .setOrigin(0.5);
    container.add([bg, text]);
    bg.on('pointerup', onClick);

    return {
      enable: () => {
        bg.setAlpha(1);
        text.setAlpha(1);
        bg.setInteractive(
          new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
          Phaser.Geom.Rectangle.Contains
        );
      },
      disable: () => {
        bg.setAlpha(0.5);
        text.setAlpha(0.5);
        bg.disableInteractive();
      }
    };
  }
}
