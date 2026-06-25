/**
 * AudioManager: shared singleton for all short SFX.
 *
 * PROBLEM this solves:
 *   The previous implementation created a NEW AudioContext on every merge
 *   sound. AudioContext is a heavyweight native object — browsers don't GC
 *   them quickly even after .close(). After 100+ merges, the tab would
 *   accumulate hundreds of dead contexts and balloon to >1GB.
 *
 * SOLUTION:
 *   One lazily-created AudioContext reused for the entire game session.
 *   Each sound creates a fresh oscillator+gain (cheap, GC'd immediately
 *   after the oscillator ends), but they all share the same context.
 *
 * The context is resumed on first use (browsers start it in 'suspended'
 * state until a user gesture occurs).
 */

export class AudioManager {
  private static instance: AudioManager | null = null;
  static getInstance(): AudioManager {
    if (!AudioManager.instance) AudioManager.instance = new AudioManager();
    return AudioManager.instance;
  }

  private ctx: AudioContext | null = null;

  private ensureContext(): AudioContext | null {
    if (this.ctx) {
      // Browsers suspend the context until a user gesture. Resume if needed.
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }
    try {
      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Call on first user interaction (e.g., the "Play" button) to unlock audio.
   * Browsers block audio until a user gesture occurs.
   */
  unlock(): void {
    this.ensureContext();
  }

  /**
   * Plays a short "pop" whose pitch rises with `value`.
   * Safe to call rapidly — each call creates only an oscillator+gain node
   * (which the GC reclaims within ~300ms after the sound ends).
   */
  playMergePop(value: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const baseFreq = 220;
      const semitones = Math.log2(value);
      osc.frequency.value = baseFreq * Math.pow(2, semitones / 12);
      osc.type = 'triangle';
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
      // Oscillator auto-disconnects after stop; no need to close the context.
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      /* sound is non-critical */
    }
  }

  /**
   * Closes the AudioContext. Call only when the entire game is being torn
   * down — NOT on scene changes. The context is shared across scenes.
   */
  destroy(): void {
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {}
      this.ctx = null;
    }
  }
}
