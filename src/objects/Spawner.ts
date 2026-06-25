/**
 * Spawner: creates floating cubes at the top of the playfield.
 *
 * Note: we deliberately do NOT add a rotation tween here. A tween would
 * keep rotating the cube after launch (since the tween targets the sprite's
 * `angle` property directly), which is the "infinite counterclockwise
 * rotation" bug. The GameScene handles the floating bob motion in update().
 */

import type Phaser from 'phaser';
import { SPAWN_X, SPAWN_Y } from '../config';
import { Cube } from './Cube';

export class Spawner {
  constructor(private scene: Phaser.Scene) {}

  /**
   * Creates a "floating" cube (static Matter body) at the spawn point.
   * The GameScene registers it in its cube set.
   */
  spawnFloating(value: number): Cube {
    const cube = new Cube(this.scene, SPAWN_X, SPAWN_Y, value, true);
    return cube;
  }
}
