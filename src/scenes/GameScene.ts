/**
 * GameScene: the core gameplay loop.
 *
 * Flow:
 *   1. A cube spawns at the top center.
 *   2. Player taps anywhere on the field — the cube is thrown toward that point
 *      with an initial velocity, then gravity takes over (parabolic motion).
 *   3. If the cube collides with another cube of the SAME value, they merge
 *      into a new cube of double the value, placed at the collision midpoint.
 *   4. If any cube stays above the danger line for too long, game over.
 *   5. After a short cooldown, the next cube spawns.
 */

import Phaser from 'phaser';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  FIELD_LEFT,
  FIELD_RIGHT,
  FIELD_TOP,
  FIELD_BOTTOM,
  DANGER_LINE_Y,
  DANGER_GRACE_MS,
  SPAWN_X,
  SPAWN_Y,
  SPAWN_VALUES,
  SPAWN_WEIGHTS,
  MAX_CUBE_VALUE,
  COLORS,
  STORAGE_KEYS,
  NEXT_CUBE_DELAY_MS,
  TAP_QUEUE_WINDOW_MS,
  LAUNCH_SPEED,
  LAUNCH_MAX_SPEED,
  WALL_PHYSICS,
  MILESTONE_VALUES
} from '../config';
import { Cube } from '../objects/Cube';
import { Spawner } from '../objects/Spawner';
import { MergeSystem } from '../systems/MergeSystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { GameOverDetector } from '../systems/GameOverDetector';
import { ShockWaveSystem } from '../systems/ShockWaveSystem';
import { AudioManager } from '../systems/AudioManager';
import { AdsManager } from '../ads/AdsManager';
import { i18n } from '../systems/I18n';

export class GameScene extends Phaser.Scene {
  // World bounds (as Matter static walls)
  private walls: MatterJS.BodyType[] = [];

  // Current cube being aimed / thrown, before physics takes over.
  // When null, we are waiting for NEXT_CUBE_DELAY_MS before spawning the next.
  private currentCube: Cube | null = null;

  // Set of all live cubes in the world (including currentCube after launch).
  public cubes: Set<Cube> = new Set();

  private spawner!: Spawner;
  private mergeSystem!: MergeSystem;
  private scoreSystem!: ScoreSystem;
  private gameOverDetector!: GameOverDetector;
  private shockWaveSystem!: ShockWaveSystem;

  // Milestone tracking: which cube values have been reached in this playthrough.
  // When a merge produces a value in MILESTONE_VALUES that we haven't seen
  // yet this game, we show the MilestoneScene overlay.
  private reachedMilestones: Set<number> = new Set();

  // Whether the MilestoneScene overlay is currently showing (pauses the game).
  private milestoneOverlayActive: boolean = false;

  // Queued tap: if the player taps while a cube is still launching (within
  // TAP_QUEUE_WINDOW_MS), we remember the target and apply it as soon as the
  // next cube spawns. This is what makes rapid-fire tapping feel responsive.
  private queuedTap: { x: number; y: number; t: number } | null = null;

  // Reusable particle emitter for merge effects.
  // Creating a new emitter per merge caused particle-pool churn; reusing one
  // emitter and just calling emitParticleAt() is much cheaper.
  private mergeEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  // UI
  private scoreText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private nextCubeText!: Phaser.GameObjects.Text;
  private dangerLine!: Phaser.GameObjects.Line;
  private dangerFlash: number = 0; // 0..1 intensity

  // Track the next value to spawn, so we can preview it.
  private nextValue: number = 2;

  // Whether the player can launch the current cube.
  private canLaunch: boolean = true;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.drawField();
    this.drawDangerLine();
    this.drawUI();

    // Reset state
    this.cubes.clear();
    this.canLaunch = true;
    this.nextValue = this.pickSpawnValue();

    // Systems
    this.spawner = new Spawner(this);
    this.mergeSystem = new MergeSystem(this);
    this.scoreSystem = new ScoreSystem();
    this.scoreSystem.onScoreChanged((s) => this.updateScoreUI(s.score, s.best));
    this.gameOverDetector = new GameOverDetector(this, this);
    this.shockWaveSystem = new ShockWaveSystem(this);

    // Reset milestone tracking at the start of each playthrough.
    this.reachedMilestones.clear();
    this.milestoneOverlayActive = false;
    this.queuedTap = null;

    // Input
    this.input.on('pointerdown', this.handlePointerDown, this);

    // Listen for merge events to spawn particles + sound.
    this.mergeSystem.onMerge((e) => this.onMerge(e));

    // Create ONE reusable particle emitter for the whole scene.
    // (Previously we created a new emitter per merge, which caused particle
    // pool churn and contributed to memory growth during long sessions.)
    this.mergeEmitter = this.add.particles(0, 0, 'particle', {
      lifespan: 600,
      speed: { min: 80, max: 220 },
      scale: { start: 0.8, end: 0 },
      quantity: 14,
      emitting: false
    });
    this.mergeEmitter.setDepth(5);

    // Cleanup on scene shutdown — kill any running tweens/timers so they
    // don't keep firing after the scene is gone (which would leak callbacks
    // and references to destroyed game objects).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.tweens.killAll();
      this.time.removeAllEvents();
      // Clear the cubes Set so destroyed cubes can be GC'd.
      this.cubes.clear();
      this.currentCube = null;
      this.queuedTap = null;
    });

    // Spawn the first cube.
    this.spawnNext();

    // Unlock audio on first interaction (browsers require a user gesture
    // before any AudioContext can produce sound).
    AudioManager.getInstance().unlock();
  }

  update(_time: number, deltaMs: number): void {
    const delta = deltaMs / 1000;
    if (!this.milestoneOverlayActive) {
      this.gameOverDetector.update(delta);
    }
    this.updateDangerLinePulse(delta);

    // Keep the current (un-launched) cube floating at the top.
    if (this.currentCube && this.currentCube.isFloating()) {
      const t = this.time.now / 400;
      const bob = Math.sin(t) * 4;
      const wobble = Math.sin(t * 0.7) * 4;
      this.currentCube.setPosition(SPAWN_X, SPAWN_Y + bob);
      this.currentCube.setAngle(wobble);
    }
  }

  // -------------------------------------------------------------------------
  // Field & UI
  // -------------------------------------------------------------------------

  private drawField(): void {
    // Playfield background
    const g = this.add.graphics();
    g.fillStyle(COLORS.field, 1);
    g.fillRect(FIELD_LEFT, FIELD_TOP, FIELD_RIGHT - FIELD_LEFT, FIELD_BOTTOM - FIELD_TOP);
    g.lineStyle(3, COLORS.fieldBorder, 1);
    g.strokeRect(FIELD_LEFT, FIELD_TOP, FIELD_RIGHT - FIELD_LEFT, FIELD_BOTTOM - FIELD_TOP);

    // Solid static walls: left, right, bottom. The top is open (cubes spawn there).
    const wallThickness = 60;
    const wallOptions = WALL_PHYSICS;
    const wallY = FIELD_BOTTOM + wallThickness / 2;
    const bottomWall = this.matter.add.rectangle(
      (FIELD_LEFT + FIELD_RIGHT) / 2,
      wallY,
      FIELD_RIGHT - FIELD_LEFT + wallThickness * 2,
      wallThickness,
      wallOptions
    );
    const leftWall = this.matter.add.rectangle(
      FIELD_LEFT - wallThickness / 2,
      (FIELD_TOP + FIELD_BOTTOM) / 2,
      wallThickness,
      FIELD_BOTTOM - FIELD_TOP + wallThickness * 2,
      wallOptions
    );
    const rightWall = this.matter.add.rectangle(
      FIELD_RIGHT + wallThickness / 2,
      (FIELD_TOP + FIELD_BOTTOM) / 2,
      wallThickness,
      FIELD_BOTTOM - FIELD_TOP + wallThickness * 2,
      wallOptions
    );
    this.walls = [bottomWall, leftWall, rightWall];
  }

  private drawDangerLine(): void {
    this.dangerLine = this.add.line(
      0,
      0,
      FIELD_LEFT,
      DANGER_LINE_Y,
      FIELD_RIGHT,
      DANGER_LINE_Y,
      COLORS.dangerLine,
      2
    );
    this.dangerLine.setOrigin(0, 0);
    this.dangerLine.setAlpha(0.5);
  }

  private drawUI(): void {
    // Score panel at top
    this.add.text(20, 20, i18n.t('game.score'), {
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px',
      color: '#8a8aa8'
    });
    this.scoreText = this.add.text(20, 38, '0', {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '32px',
      color: '#ffffff'
    });

    this.add.text(GAME_WIDTH - 20, 20, i18n.t('game.best'), {
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px',
      color: '#8a8aa8'
    }).setOrigin(1, 0);
    const best = Number(localStorage.getItem(STORAGE_KEYS.bestScore) ?? 0);
    this.bestText = this.add.text(GAME_WIDTH - 20, 38, String(best), {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '32px',
      color: '#e94560'
    }).setOrigin(1, 0);

    // "Next" preview
    this.add.text(GAME_WIDTH / 2, 30, i18n.t('game.next'), {
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      color: '#8a8aa8'
    }).setOrigin(0.5);
    this.nextCubeText = this.add.text(GAME_WIDTH / 2, 56, '2', {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '24px',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.updateScoreUI(0, best);
  }

  private updateScoreUI(score: number, best: number): void {
    this.scoreText.setText(String(score));
    this.bestText.setText(String(best));
  }

  private updateNextUI(): void {
    this.nextCubeText.setText(String(this.nextValue));
  }

  private updateDangerLinePulse(delta: number): void {
    // If any cube is currently above the danger line, pulse the line red.
    let dangerActive = false;
    for (const cube of this.cubes) {
      if (cube.y < DANGER_LINE_Y && !cube.isFloating()) {
        dangerActive = true;
        break;
      }
    }
    if (dangerActive) {
      this.dangerFlash = Math.min(1, this.dangerFlash + delta * 2);
    } else {
      this.dangerFlash = Math.max(0, this.dangerFlash - delta * 2);
    }
    this.dangerLine.setAlpha(0.4 + this.dangerFlash * 0.6);
    this.dangerLine.setLineWidth(2 + this.dangerFlash * 3);
  }

  // -------------------------------------------------------------------------
  // Spawning & input
  // -------------------------------------------------------------------------

  private pickSpawnValue(): number {
    const totalWeight = SPAWN_WEIGHTS.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    for (let i = 0; i < SPAWN_VALUES.length; i++) {
      r -= SPAWN_WEIGHTS[i];
      if (r <= 0) return SPAWN_VALUES[i];
    }
    return SPAWN_VALUES[0];
  }

  private spawnNext(): void {
    if (!this.canLaunch) return;
    // Defensive: don't spawn a second floating cube if one is already waiting.
    // (In normal flow this should never trigger, but it guards against any
    // double-timer race that could slip through.)
    if (this.currentCube && this.currentCube.isFloating()) return;
    const value = this.nextValue;
    this.currentCube = this.spawner.spawnFloating(value);
    this.cubes.add(this.currentCube);
    // Pre-pick the NEXT next value for the preview.
    this.nextValue = this.pickSpawnValue();
    this.updateNextUI();
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    // Ignore taps while the milestone overlay is up — the overlay handles its own input.
    if (this.milestoneOverlayActive) return;

    // Restrict target to within the playfield horizontally.
    const targetX = Phaser.Math.Clamp(pointer.x, FIELD_LEFT + 20, FIELD_RIGHT - 20);
    const targetY = Phaser.Math.Clamp(pointer.y, FIELD_TOP, FIELD_BOTTOM);

    if (this.canLaunch && this.currentCube && !this.currentCube.isLaunched()) {
      this.launchCurrentCube(targetX, targetY);
      return;
    }

    // Otherwise, queue the tap if the player tapped within the queue window.
    // This lets players spam-tap: each tap launches a cube as soon as one is ready.
    this.queuedTap = { x: targetX, y: targetY, t: this.time.now };
  }

  private launchCurrentCube(targetX: number, targetY: number): void {
    if (!this.currentCube) return;
    // Guard against double-launch: if currentCube is already launched
    // (e.g., due to a tap firing in the same frame as a queued-tap launch),
    // do nothing and don't schedule another spawn timer — otherwise
    // two timers would fire 200ms later and spawn two cubes at the same spot.
    if (this.currentCube.isLaunched()) return;
    const cube = this.currentCube;
    const dx = targetX - cube.x;
    const dy = targetY - cube.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const speed = Math.min(LAUNCH_MAX_SPEED, LAUNCH_SPEED);
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;

    cube.launch(vx, vy);

    // Cooldown before next cube appears.
    this.canLaunch = false;
    this.time.delayedCall(NEXT_CUBE_DELAY_MS, () => {
      if (this.gameOverDetector.isGameOver()) return;
      this.canLaunch = true;
      this.spawnNext();
      // After spawning, check if there's a queued tap to apply immediately.
      // We call launchCurrentCube SYNCHRONOUSLY (not via delayedCall(0))
      // to eliminate the one-frame race window where a real pointerdown
      // could fire between spawnNext() and the deferred launch, causing
      // launchCurrentCube to be called twice and scheduling two spawn timers.
      if (this.queuedTap) {
        const age = this.time.now - this.queuedTap.t;
        if (age < TAP_QUEUE_WINDOW_MS + NEXT_CUBE_DELAY_MS) {
          const q = this.queuedTap;
          this.queuedTap = null;
          this.launchCurrentCube(q.x, q.y);
        } else {
          this.queuedTap = null;
        }
      }
    });
  }

  // -------------------------------------------------------------------------
  // Merge events
  // -------------------------------------------------------------------------

  private onMerge(e: { newValue: number; x: number; y: number }): void {
    // Score: the merged cube's value (so 4+4=8 gives +8).
    this.scoreSystem.addScore(e.newValue);
    // Shockwave pushes nearby cubes outward from the merge epicenter.
    this.shockWaveSystem.trigger(e.x, e.y, e.newValue);
    // Particle burst
    this.spawnMergeParticles(e.x, e.y, e.newValue);
    // Sound (placeholder — no asset; uses WebAudio beep)
    this.playMergeSound(e.newValue);
    // Milestone check: if this is a new high-value cube for this playthrough,
    // show the congratulation overlay.
    if (MILESTONE_VALUES.includes(e.newValue) && !this.reachedMilestones.has(e.newValue)) {
      this.reachedMilestones.add(e.newValue);
      this.showMilestone(e.newValue);
    }
  }

  private showMilestone(value: number): void {
    this.milestoneOverlayActive = true;
    // Launch the overlay scene on top of this one. It will pause this scene
    // and resume it when dismissed.
    this.scene.launch('MilestoneScene', { value });
    this.scene.pause();
  }

  /**
   * Called by MilestoneScene when the user dismisses the dialog.
   * (We expose this via scene events so MilestoneScene doesn't need to import GameScene.)
   */
  resumeFromMilestone(): void {
    this.milestoneOverlayActive = false;
    this.scene.resume();
  }

  private spawnMergeParticles(x: number, y: number, value: number): void {
    const color = Phaser.Display.Color.IntegerToColor(
      this.lookupCubeColor(value)
    );
    // Reuse the shared emitter instead of creating a new one each merge.
    // Phaser 3.86 ParticleEmitter.emitParticleAt takes only (x, y, count),
    // so we change tint via the emitter's `tint` property before emitting.
    (this.mergeEmitter as any).tint = color.color;
    this.mergeEmitter.emitParticleAt(x, y, 14);
  }

  private lookupCubeColor(value: number): number {
    const styles = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
    const found = styles.find((v) => v === value);
    if (found === undefined) return 0xffffff;
    // Mirror config.ts palette.
    const palette: Record<number, number> = {
      2: 0xeee4da,
      4: 0xede0c8,
      8: 0xf2b179,
      16: 0xf59563,
      32: 0xf67c5f,
      64: 0xf65e3b,
      128: 0xedcf72,
      256: 0xedcc61,
      512: 0xedc850,
      1024: 0xedc53f,
      2048: 0xedc22e
    };
    return palette[found] ?? 0xffffff;
  }

  private playMergeSound(value: number): void {
    // Delegated to the shared AudioManager — uses a single AudioContext
    // for the entire game instead of creating one per sound.
    AudioManager.getInstance().playMergePop(value);
  }

  // -------------------------------------------------------------------------
  // Game over
  // -------------------------------------------------------------------------

  triggerGameOver(): void {
    if (this.gameOverDetector.isGameOver()) return;
    this.gameOverDetector.markGameOver();

    const score = this.scoreSystem.getScore();
    const best = this.scoreSystem.getBest();
    const isRecord = score >= best && score > 0;

    // Persist death count for ad frequency control.
    const totalDeaths =
      Number(localStorage.getItem(STORAGE_KEYS.totalDeaths) ?? 0) + 1;
    localStorage.setItem(STORAGE_KEYS.totalDeaths, String(totalDeaths));

    // Try to show an interstitial (every N deaths, with min gap).
    AdsManager.getInstance()
      .maybeShowInterstitialOnDeath(totalDeaths)
      .catch(() => {});

    this.scene.start('GameOverScene', { score, best, isRecord });
  }

  // -------------------------------------------------------------------------
  // Cube registry (called by MergeSystem / Cube itself)
  // -------------------------------------------------------------------------

  registerCube(cube: Cube): void {
    this.cubes.add(cube);
  }

  unregisterCube(cube: Cube): void {
    this.cubes.delete(cube);
  }

  getCubes(): Cube[] {
    return Array.from(this.cubes);
  }

  /**
   * Convenience for the merge system: spawn a new cube at a position.
   */
  spawnMergedCube(value: number, x: number, y: number, vx: number, vy: number): Cube {
    const cube = new Cube(this, x, y, value, false);
    cube.setVelocity(vx, vy);
    this.cubes.add(cube);
    return cube;
  }
}
