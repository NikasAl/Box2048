/**
 * GameStatePersistence: save and restore the game state to localStorage.
 *
 * Saved state contains:
 *   - All cubes currently on the field (x, y, angle, value)
 *     Velocity is NOT saved — cubes should rest when restored, not fly.
 *   - Current score
 *   - Best score (also persisted separately for the menu screen)
 *   - The next cube value (preview)
 *   - Reached milestones (so they don't trigger again on restore)
 *   - Schema version (for future migrations)
 *
 * Save triggers:
 *   - GameScene SHUTDOWN (scene change to GameOver / Menu)
 *   - GameScene PAUSE (when MilestoneScene is shown over it)
 *   - Game over (cleared — don't resume a lost game)
 *
 * Load trigger:
 *   - GameScene.create() — if a saved state exists, restore it.
 *     The MenuScene offers a "Continue" button that starts GameScene
 *     normally; GameScene itself checks for the saved state.
 */

import { STORAGE_KEYS } from '../config';
import type { Cube } from '../objects/Cube';

const SCHEMA_VERSION = 1;

export interface SavedCube {
  x: number;
  y: number;
  angle: number;
  value: number;
}

export interface SavedGameState {
  version: number;
  savedAt: number; // Date.now() — for debugging / expiry
  cubes: SavedCube[];
  score: number;
  best: number;
  nextValue: number;
  reachedMilestones: number[];
}

export class GameStatePersistence {
  /**
   * Save the current game state. Safe to call on every cube change, but
   * in practice we only save on scene shutdown / pause to avoid hammering
   * localStorage on every frame.
   */
  static save(state: SavedGameState): void {
    try {
      const json = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEYS.savedState, json);
    } catch (e) {
      console.warn('[GameStatePersistence] save failed:', e);
    }
  }

  /**
   * Save from a live GameScene. Extracts cube positions/angles/values,
   * score, best, nextValue, and reached milestones.
   */
  static saveFromScene(params: {
    cubes: Set<Cube>;
    score: number;
    best: number;
    nextValue: number;
    reachedMilestones: Set<number>;
  }): void {
    const cubes: SavedCube[] = [];
    for (const cube of params.cubes) {
      // Don't save floating cubes (the one being aimed) — they have no
      // meaningful physics state and would overlap with the next spawn.
      if (cube.isFloating()) continue;
      if (!cube.active) continue;
      cubes.push({
        x: cube.x,
        y: cube.y,
        angle: cube.angle,
        value: cube.value
      });
    }
    // Don't bother saving if there are no cubes and score is 0 — nothing
    // meaningful to resume.
    if (cubes.length === 0 && params.score === 0) {
      this.clear();
      return;
    }
    this.save({
      version: SCHEMA_VERSION,
      savedAt: Date.now(),
      cubes,
      score: params.score,
      best: params.best,
      nextValue: params.nextValue,
      reachedMilestones: Array.from(params.reachedMilestones)
    });
  }

  /**
   * Load the saved game state, or null if none exists.
   */
  static load(): SavedGameState | null {
    try {
      const json = localStorage.getItem(STORAGE_KEYS.savedState);
      if (!json) return null;
      const state = JSON.parse(json) as SavedGameState;
      if (state.version !== SCHEMA_VERSION) {
        console.warn(
          `[GameStatePersistence] schema version mismatch: ${state.version} vs ${SCHEMA_VERSION}. Discarding.`
        );
        this.clear();
        return null;
      }
      if (!Array.isArray(state.cubes)) {
        console.warn('[GameStatePersistence] invalid state: cubes is not an array');
        this.clear();
        return null;
      }
      return state;
    } catch (e) {
      console.warn('[GameStatePersistence] load failed:', e);
      return null;
    }
  }

  /**
   * Returns true if a saved game state exists.
   */
  static hasSavedState(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEYS.savedState) !== null;
    } catch {
      return false;
    }
  }

  /**
   * Clear the saved game state. Called on game over (so a lost game is
   * not resumed) and when the player explicitly starts a new game.
   */
  static clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.savedState);
    } catch (e) {
      console.warn('[GameStatePersistence] clear failed:', e);
    }
  }
}
