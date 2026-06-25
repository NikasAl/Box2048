/**
 * GameOverDetector: triggers game over when a cube stays above the danger
 * line for longer than DANGER_GRACE_MS.
 *
 * Floating cubes (the one being aimed) are excluded — they are expected to
 * be above the line by design.
 */

import Phaser from 'phaser';
import { DANGER_LINE_Y, DANGER_GRACE_MS } from '../config';
import type { Cube } from '../objects/Cube';
import type { GameScene } from '../scenes/GameScene';

export class GameOverDetector {
  private timeAboveLine: Map<number, number> = new Map();
  private gameOver: boolean = false;

  constructor(private scene: GameScene, private registry: { cubes: Set<Cube> }) {}

  isGameOver(): boolean {
    return this.gameOver;
  }

  markGameOver(): void {
    this.gameOver = true;
  }

  update(deltaSeconds: number): void {
    if (this.gameOver) return;
    const deltaMs = deltaSeconds * 1000;

    // Clean up stale ids (destroyed cubes).
    const liveIds = new Set<number>();
    for (const cube of this.registry.cubes) {
      liveIds.add(cube.id);

      // Floating cubes don't count toward game over.
      if (cube.isFloating()) continue;

      // Reset timer if cube is below the danger line or moving upward fast
      // (just-thrown cubes can briefly cross the line on launch).
      const body = cube.body as any;
      const vy = body?.velocity?.y ?? 0;
      if (cube.y >= DANGER_LINE_Y || vy < -1) {
        this.timeAboveLine.delete(cube.id);
        continue;
      }

      const prev = this.timeAboveLine.get(cube.id) ?? 0;
      const next = prev + deltaMs;
      if (next >= DANGER_GRACE_MS) {
        // Trigger game over.
        this.gameOver = true;
        this.scene.triggerGameOver();
        return;
      }
      this.timeAboveLine.set(cube.id, next);
    }

    // Drop any stale ids (cubes destroyed since last update).
    for (const id of this.timeAboveLine.keys()) {
      if (!liveIds.has(id)) this.timeAboveLine.delete(id);
    }
  }
}
