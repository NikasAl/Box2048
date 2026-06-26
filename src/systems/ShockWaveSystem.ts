/**
 * ShockWaveSystem: applies an explosive impulse to nearby cubes when a merge
 * happens, so they get pushed outward from the merge epicenter.
 *
 * Effect breakdown:
 *   - Each cube within SHOCKWAVE.radius receives an impulse whose magnitude
 *     falls off linearly with distance (full strength at center, 0 at edge).
 *   - Direction: from epicenter to cube (radial outward).
 *   - A small upward component is added so cubes "jump" slightly.
 *   - Floating cubes (the one being aimed) are NOT affected.
 *
 * Visual:
 *   - A expanding ring graphic is drawn at the epicenter, fading out as it
 *     expands. Purely cosmetic.
 */

import Phaser from 'phaser';
import { SHOCKWAVE, COLORS } from '../config';
import type { Cube } from '../objects/Cube';
import type { GameScene } from '../scenes/GameScene';

export class ShockWaveSystem {
  constructor(private scene: GameScene) {}

  /**
   * Triggers a shockwave at (x, y) with strength proportional to `value`
   * (bigger merges = bigger wave).
   */
  trigger(x: number, y: number, value: number): void {
    // Scale strength with cube value: log2(value) gives a smooth ramp
    // (2→1, 4→2, 8→3, 16→4, 32→5, ...). Capped at 3× base strength.
    const magnitudeScale = Math.min(3, Math.log2(value));
    const radius = SHOCKWAVE.radius * (0.7 + 0.15 * magnitudeScale);
    const strength = SHOCKWAVE.strength * magnitudeScale;
    // Uplift (upward component) — reduced by half to prevent cubes from
    // being launched above the danger line and getting stuck above the
    // playfield. The radial outward push is preserved for visual effect.
    const uplift = (SHOCKWAVE.uplift * magnitudeScale) * 0.5;

    const cubes = this.scene.getCubes();
    for (const cube of cubes) {
      if (cube.isFloating()) continue;
      if (!cube.active) continue;
      const dx = cube.x - x;
      const dy = cube.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist > radius || dist < 0.001) continue;
      // Linear falloff: 1 at center, 0 at edge.
      const falloff = 1 - dist / radius;
      const nx = dx / dist;
      const ny = dy / dist;
      const impulseX = nx * strength * falloff;
      const impulseY = ny * strength * falloff - uplift * falloff;
      // Apply as velocity delta. Matter has applyForce but the magnitudes
      // are tiny and need mass scaling — setVelocity-delta is more predictable.
      const body = cube.body as any;
      if (!body) continue;
      const curVx = body.velocity?.x ?? 0;
      const curVy = body.velocity?.y ?? 0;
      cube.setVelocity(curVx + impulseX, curVy + impulseY);
    }

    this.spawnVisual(x, y, radius);
  }

  /**
   * Draws an expanding ring + flash at the epicenter.
   */
  private spawnVisual(x: number, y: number, radius: number): void {
    // White flash circle (quick fade out)
    const flash = this.scene.add.circle(x, y, 12, 0xffffff, 0.9);
    flash.setDepth(10);
    this.scene.tweens.add({
      targets: flash,
      scale: { from: 1, to: 4 },
      alpha: { from: 0.9, to: 0 },
      duration: 250,
      ease: 'Cubic.out',
      onComplete: () => flash.destroy()
    });

    // Expanding ring
    const ring = this.scene.add.graphics();
    ring.setDepth(9);
    ring.lineStyle(3, COLORS.accent, 1);
    ring.strokeCircle(0, 0, 1);
    ring.setPosition(x, y);
    const duration = 400;
    this.scene.tweens.add({
      targets: ring,
      duration,
      ease: 'Cubic.out',
      onUpdate: (_tween, target) => {
        // Compute progress from the tween's elapsed time (more reliable
        // than the `current` callback arg whose type is unknown in this
        // Phaser version).
        const progress = Math.min(1, _tween.elapsed / duration);
        const r = radius * progress;
        const alpha = 1 - progress;
        target.clear();
        target.lineStyle(3, COLORS.accent, alpha);
        target.strokeCircle(0, 0, r);
      },
      onComplete: () => ring.destroy()
    });
  }
}
