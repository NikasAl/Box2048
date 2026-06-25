/**
 * Cube: a Matter.js rectangle with a sprite and a numeric value.
 *
 * Lifecycle:
 *   1. Created as a "floating" cube (no physics body, follows spawn position).
 *   2. On launch, a Matter body is attached and physics takes over.
 *   3. On merge with another cube of the same value, both are destroyed
 *      and a new cube of double the value is spawned in their place.
 */

import Phaser from 'phaser';
import { CUBE_PHYSICS, getCubeSize } from '../config';

export type CubeState = 'floating' | 'launched';

export class Cube extends Phaser.Physics.Matter.Sprite {
  public value: number;
  public state: CubeState = 'floating';
  /**
   * Set to true the instant a merge decision is made for this cube,
   * to prevent double-processing within the same physics step.
   */
  public merging: boolean = false;
  /**
   * Unique id for tracking per-cube timers (e.g. time-above-danger-line).
   */
  public readonly id: number = Cube.nextId++;

  private static nextId: number = 1;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    value: number,
    floating: boolean
  ) {
    const textureKey = `cube-${value}`;
    super(
      scene.matter.world,
      x,
      y,
      textureKey,
      undefined,
      floating
        ? { isStatic: true } // floating cubes are pinned until launch
        : {
            isStatic: CUBE_PHYSICS.isStatic,
            restitution: CUBE_PHYSICS.restitution,
            friction: CUBE_PHYSICS.friction,
            frictionStatic: CUBE_PHYSICS.frictionStatic,
            frictionAir: CUBE_PHYSICS.frictionAir,
            density: CUBE_PHYSICS.density,
            chamfer: CUBE_PHYSICS.chamfer
          }
    );
    this.value = value;
    this.state = floating ? 'floating' : 'launched';
    this.setDisplaySize(getCubeSize(value), getCubeSize(value));
    // For Matter sprites, the body shape matches the texture size by default.
    scene.add.existing(this);
    // NOTE: we deliberately do NOT call setFixedRotation() — we want cubes
    // to rotate and roll naturally like real wooden blocks. Angular damping
    // is achieved via frictionAir (applied to angular velocity too) and
    // via friction when cubes come to rest on each other.
  }

  isFloating(): boolean {
    return this.state === 'floating';
  }

  isLaunched(): boolean {
    return this.state === 'launched';
  }

  /**
   * Convert a floating cube into a dynamic physics body, then apply
   * an initial velocity. We do this by re-creating the body with the
   * dynamic settings (Matter doesn't support flipping isStatic on a
   * body that was created with isStatic:true cleanly enough for our needs).
   */
  launch(vx: number, vy: number): void {
    if (this.state === 'launched') return;
    // Kill any tweens still targeting this cube (e.g., floating animations).
    this.scene.tweens.killTweensOf(this);
    const size = getCubeSize(this.value);
    const newBody = (this.scene.matter.add as any).rectangle(
      this.x,
      this.y,
      size,
      size,
      {
        isStatic: false,
        restitution: CUBE_PHYSICS.restitution,
        friction: CUBE_PHYSICS.friction,
        frictionStatic: CUBE_PHYSICS.frictionStatic,
        frictionAir: CUBE_PHYSICS.frictionAir,
        density: CUBE_PHYSICS.density,
        chamfer: CUBE_PHYSICS.chamfer
      }
    );
    // Attach the new body to this sprite.
    this.setExistingBody(newBody);
    this.setVelocity(vx, vy);
    // NOTE: no setFixedRotation() — cubes roll naturally.
    // Reset any residual angular velocity from the floating state.
    this.setAngularVelocity(0);
    this.state = 'launched';
  }

  /**
   * Safe destroy that also removes the Matter body.
   */
  destroySelf(): void {
    if (this.body) {
      this.scene.matter.world.remove(this.body as MatterJS.BodyType);
    }
    this.destroy();
  }
}
