/**
 * PreloadScene: generates all cube textures programmatically using
 * CanvasTexture API (more reliable than Graphics+RenderTexture compositing).
 *
 * Each cube texture is a rounded rectangle with the cube's color and its
 * numeric value drawn in the center.
 */

import Phaser from 'phaser';
import { CUBE_STYLES, SPAWN_VALUES, MAX_CUBE_VALUE } from '../config';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  /**
   * Note: texture generation runs in create(), not preload().
   * CanvasTexture and this.textures API require the scene to be active,
   * which only happens once create() is entered.
   */
  create(): void {
    this.makeParticleTexture();
    this.makeCubeTextures();
    this.scene.start('MenuScene');
  }

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
      const fontSize = value < 100 ? 30 : value < 1000 ? 24 : 20;

      const canvas = this.textures.createCanvas(`cube-${value}`, size, size);
      if (!canvas) {
        console.error(`[PreloadScene] Failed to create canvas for cube-${value}`);
        continue;
      }
      const ctx = canvas.getContext();

      // Background (rounded rect) — solid fill
      ctx.fillStyle = this.hex(style.bg);
      this.drawRoundRect(ctx, 0, 0, size, size, radius);
      ctx.fill();

      // Subtle bottom shadow strip for depth
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      this.drawRoundRect(ctx, 0, size - 8, size, 8, { tl: 0, tr: 0, bl: radius, br: radius } as any);
      ctx.fill();

      // Top inner highlight (glossy look)
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      this.drawRoundRect(ctx, 3, 3, size - 6, size * 0.45, radius - 2);
      ctx.fill();

      // Border outline
      ctx.strokeStyle = 'rgba(0,0,0,0.30)';
      ctx.lineWidth = 2;
      this.drawRoundRect(ctx, 1, 1, size - 2, size - 2, radius);
      ctx.stroke();

      // Numeric label
      ctx.fillStyle = this.hex(style.text);
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(value), size / 2, size / 2 + 1);

      canvas.refresh();
    }
  }

  private makeParticleTexture(): void {
    const size = 16;
    const canvas = this.textures.createCanvas('particle', size, size);
    if (!canvas) return;
    const ctx = canvas.getContext();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    canvas.refresh();
  }

  private hex(n: number): string {
    return '#' + n.toString(16).padStart(6, '0');
  }

  /**
   * Draws a rounded rectangle path on the given 2D context.
   * Call ctx.fill() or ctx.stroke() afterwards to actually render it.
   */
  private drawRoundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number | { tl: number; tr: number; br: number; bl: number }
  ): void {
    const radii =
      typeof r === 'number'
        ? { tl: r, tr: r, br: r, bl: r }
        : r;
    ctx.beginPath();
    ctx.moveTo(x + radii.tl, y);
    ctx.lineTo(x + w - radii.tr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radii.tr);
    ctx.lineTo(x + w, y + h - radii.br);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radii.br, y + h);
    ctx.lineTo(x + radii.bl, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radii.bl);
    ctx.lineTo(x, y + radii.tl);
    ctx.quadraticCurveTo(x, y, x + radii.tl, y);
    ctx.closePath();
  }
}
