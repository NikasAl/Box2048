/**
 * MergeSystem: listens to Matter collisionStart events and merges pairs of
 * cubes that share the same numeric value.
 *
 * Rules:
 *   - Only launched (dynamic) cubes participate in merges.
 *   - A cube can only be part of ONE merge per physics step (the `merging`
 *     flag guards against this).
 *   - The new cube inherits the average position of the two originals,
 *     with a small upward "pop" velocity.
 *   - Score is awarded based on the new value (handled by GameScene).
 *
 * CRITICAL: Matter.js does NOT allow modifying the world (adding/removing
 * bodies) inside a collisionstart callback — doing so causes infinite loops
 * or hard freezes. We collect the pairs to merge during the callback, then
 * defer the actual merge to the next tick via `scene.time.delayedCall(0, ...)`.
 */

import Phaser from 'phaser';
import { MAX_CUBE_VALUE } from '../config';
import { Cube } from '../objects/Cube';
import type { GameScene } from '../scenes/GameScene';

export type MergeEventHandler = (event: {
  newValue: number;
  x: number;
  y: number;
}) => void;

export class MergeSystem {
  private listeners: MergeEventHandler[] = [];

  constructor(private scene: GameScene) {
    const matter = scene.matter;
    matter.world.on('collisionstart', this.handleCollision, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      matter.world.off('collisionstart', this.handleCollision, this);
    });
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => {
      matter.world.off('collisionstart', this.handleCollision, this);
    });
  }

  onMerge(handler: MergeEventHandler): void {
    this.listeners.push(handler);
  }

  private handleCollision(event: any): void {
    const pairs = event.pairs ?? [];
    const pendingMerges: Array<{ a: Cube; b: Cube }> = [];

    for (const pair of pairs) {
      const bodyA = pair.bodyA;
      const bodyB = pair.bodyB;
      const a = bodyA?.gameObject as Cube | undefined;
      const b = bodyB?.gameObject as Cube | undefined;
      if (!a || !b) continue;
      if (!(a instanceof Cube) || !(b instanceof Cube)) continue;
      // Both cubes must be dynamic (launched) — floating cubes can't merge.
      if (a.isFloating() || b.isFloating()) continue;
      if (a.merging || b.merging) continue;
      if (a.value !== b.value) continue;
      if (a.value >= MAX_CUBE_VALUE) continue;

      // Mark both as merging so no other pair involving them this step
      // triggers a second merge.
      a.merging = true;
      b.merging = true;
      pendingMerges.push({ a, b });
    }

    if (pendingMerges.length === 0) return;

    // Defer the actual world mutation to the next tick.
    // This prevents Matter.js from re-entering the collision callback
    // with half-destroyed bodies, which is what caused the freeze.
    const pending = pendingMerges.slice();
    this.scene.time.delayedCall(0, () => {
      // Bail out if the scene has been shut down between scheduling and firing.
      if (!this.scene.scene.isActive() && !this.scene.scene.isVisible()) return;
      for (const { a, b } of pending) {
        // The cubes might have been destroyed by an earlier merge in this batch,
        // or by a scene transition. Check `active` before touching them.
        if (!a.active || !b.active) continue;
        try {
          this.mergePair(a, b);
        } catch (err) {
          console.error('[MergeSystem] mergePair threw:', err);
        }
      }
    });
  }

  private mergePair(a: Cube, b: Cube): void {
    const scene = this.scene;
    const newValue = a.value * 2;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;

    // Capture velocities BEFORE destroying the bodies — after destroy,
    // body.velocity becomes undefined.
    // Note: upward boost reduced from -1.5 to -0.8 to prevent cubes from
    // flying too high after a merge (which previously let them escape
    // above the field). Side walls + ceiling are still in place as a
    // physical backstop, but reducing the boost here keeps gameplay
    // feel natural without cubes bouncing off-screen.
    const aBody = a.body as any;
    const bBody = b.body as any;
    const vx = ((aBody?.velocity?.x ?? 0) + (bBody?.velocity?.x ?? 0)) / 2;
    const vy = ((aBody?.velocity?.y ?? 0) + (bBody?.velocity?.y ?? 0)) / 2 - 0.8;

    // Remove both cubes from the registry first, then destroy the bodies.
    scene.unregisterCube(a);
    scene.unregisterCube(b);
    a.destroySelf();
    b.destroySelf();

    // Spawn the merged cube (constructor calls setFixedRotation automatically).
    scene.spawnMergedCube(newValue, midX, midY, vx, vy);

    // Notify listeners (for particles, sound, score).
    for (const l of this.listeners) {
      l({ newValue, x: midX, y: midY });
    }
  }
}
