/**
 * Shared TypeScript types and interfaces.
 */

import type { Cube } from './objects/Cube';

export interface CubeStyle {
  bg: number;
  text: number;
  size: number;
}

export interface CollisionPair {
  bodyA: MatterJS.BodyType;
  bodyB: MatterJS.BodyType;
}

export interface MergeEvent {
  newValue: number;
  x: number;
  y: number;
}

export interface ScoreChangedEvent {
  score: number;
  best: number;
  delta: number;
}

export interface GameOverEvent {
  score: number;
  best: number;
}

/**
 * The Yandex Ads native plugin contract.
 * Implemented by:
 *   - on web: a stub class (no-op) defined in ads/AdsManager.ts
 *   - on native Android: a Capacitor plugin (to be implemented in android/)
 */
export interface YandexAdsPlugin {
  initialize(): Promise<void>;
  loadInterstitial(options: { adId: string }): Promise<void>;
  showInterstitial(): Promise<void>;
  loadRewarded(options: { adId: string }): Promise<void>;
  showRewarded(): Promise<void>;
}

/**
 * Internal cube registry used by MergeSystem and GameOverDetector.
 */
export interface CubeRegistry {
  cubes: Set<Cube>;
  registerCube(cube: Cube): void;
  unregisterCube(cube: Cube): void;
}
