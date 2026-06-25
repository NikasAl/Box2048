/**
 * Spawner: creates floating cubes at the top of the playfield.
 * The floating cube is then thrown by the player via GameScene.handlePointerDown.
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
    // Spin gently to give a sense of life.
    this.scene.tweens.add({
      targets: cube,
      angle: cube.angle + 360,
      duration: 6000,
      repeat: -1,
      ease: 'Linear'
    });
    return cube;
  }
}
