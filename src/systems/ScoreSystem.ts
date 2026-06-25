/**
 * ScoreSystem: tracks the current score and persists the best score
 * in localStorage.
 */

import { STORAGE_KEYS } from '../config';
import type { ScoreChangedEvent } from '../types';

export class ScoreSystem {
  private score: number = 0;
  private best: number = 0;
  private listeners: ((e: ScoreChangedEvent) => void)[] = [];

  constructor() {
    const stored = Number(localStorage.getItem(STORAGE_KEYS.bestScore) ?? 0);
    this.best = Number.isFinite(stored) ? stored : 0;
  }

  getScore(): number {
    return this.score;
  }

  getBest(): number {
    return this.best;
  }

  addScore(delta: number): void {
    if (delta <= 0) return;
    this.score += delta;
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem(STORAGE_KEYS.bestScore, String(this.best));
    }
    this.emit();
  }

  reset(): void {
    this.score = 0;
    this.emit();
  }

  onScoreChanged(handler: (e: ScoreChangedEvent) => void): void {
    this.listeners.push(handler);
  }

  private emit(): void {
    const e: ScoreChangedEvent = {
      score: this.score,
      best: this.best,
      delta: 0
    };
    for (const l of this.listeners) l(e);
  }
}
