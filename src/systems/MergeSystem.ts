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
    // Matter emits 'collisionstart' once per pair per physics step.
    const matter = scene.matter;
    matter.world.on('collisionstart', this.handleCollision, this);
    // Clean up when the scene shuts down.
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

      this.mergePair(a, b);
    }
  }

  private mergePair(a: Cube, b: Cube): void {
    const scene = this.scene;
    const newValue = a.value * 2;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;

    // Preserve some of the average momentum + small upward pop.
    const aBody = a.body as any;
    const bBody = b.body as any;
    const vx = ((aBody?.velocity?.x ?? 0) + (bBody?.velocity?.x ?? 0)) / 2;
    const vy = ((aBody?.velocity?.y ?? 0) + (bBody?.velocity?.y ?? 0)) / 2 - 2;

    // Remove both cubes from the registry and the world.
    scene.unregisterCube(a);
    scene.unregisterCube(b);
    a.destroySelf();
    b.destroySelf();

    // Spawn the merged cube.
    scene.spawnMergedCube(newValue, midX, midY, vx, vy);

    // Notify listeners.
    for (const l of this.listeners) {
      l({ newValue, x: midX, y: midY });
    }
  }
}
