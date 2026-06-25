/**
 * PreloadScene: generates all cube textures programmatically (no external
 * sprites required for the prototype). When the assets are ready, jumps
 * to the main menu.
 */

import Phaser from 'phaser';
import { CUBE_STYLES, SPAWN_VALUES, MAX_CUBE_VALUE } from '../config';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload(): void {
    // Generate a circle "particle" texture for merge effects.
    this.makeParticleTexture();
    // Generate all cube textures up front so merges to higher values
    // don't cause hitches during gameplay.
    this.makeCubeTextures();
  }

  create(): void {
    this.scene.start('MenuScene');
  }

  /**
   * Each cube value gets its own texture key: 'cube-2', 'cube-4', ...
   * The texture is a rounded rectangle filled with the cube's color,
   * with the value as text drawn on top. Drawing text into a texture
   * avoids re-rendering text every frame during gameplay.
   */
  private makeCubeTextures(): void {
    const allValues: number[] = [...SPAWN_VALUES];
    for (let v = 32; v <= MAX_CUBE_VALUE; v *= 2) {
      allValues.push(v);
    }

    for (const value of allValues) {
      const style = CUBE_STYLES[value] ?? {
        bg: 0x3c3a32,
        text: 0xffffff,
        size: 80
      };
      const size = style.size;
      const radius = 10;
      const padding = 6;

      const g = this.add.graphics();
      g.fillStyle(style.bg, 1);
      // Slight 3D shading: darker bottom strip for depth.
      g.fillRoundedRect(0, 0, size, size, radius);
      g.fillStyle(0x000000, 0.18);
      g.fillRect(0, size - 6, size, 6);
      g.fillStyle(0xffffff, 0.12);
      g.fillRoundedRect(0, 0, size, size - 4, radius);

      g.generateTexture(`cube-${value}`, size, size);
      g.destroy();

      // Render the value text on top via a Text -> texture.
      const fontSize = value < 100 ? 28 : value < 1000 ? 24 : 20;
      const text = this.add.text(size / 2, size / 2 - 1, String(value), {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: `${fontSize}px`,
        color: `#${style.text.toString(16).padStart(6, '0')}`,
        align: 'center'
      });
      text.setOrigin(0.5);

      // Composite text onto the cube texture using a RenderTexture.
      const rt = this.add.renderTexture(0, 0, size, size);
      rt.setVisible(false);
      rt.draw(`cube-${value}`, 0, 0);
      rt.draw(text, 0, 0);
      rt.saveTexture(`cube-${value}`);
      rt.destroy();
      text.destroy();
    }
  }

  private makeParticleTexture(): void {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture('particle', 16, 16);
    g.destroy();
  }
}
