/**
 * TiltController: turns raw DeviceMotion acceleration into a smooth,
 * calibrated gravity vector for the game.
 *
 * Pipeline:
 *   1. Sample raw acceleration (m/s²) from DeviceMotion.
 *   2. Subtract a calibration baseline so "neutral phone position" = (0, 0).
 *   3. Apply exponential smoothing (low-pass filter) to reduce jitter.
 *   4. Map to a gravity vector in game coordinates:
 *        - Phone tilted right  → gravity.x > 0 → cubes slide right
 *        - Phone tilted left   → gravity.x < 0 → cubes slide left
 *        - Phone tilted forward → gravity.y > 1.2 (default) → cubes fall faster
 *        - Phone tilted back    → gravity.y < 1.2 → cubes fall slower / float
 *   5. Clamp to a sane range so the player can't launch cubes off-screen.
 *
 * Calibration:
 *   - On enable(), we capture the current (x, y) as the "neutral" baseline.
 *   - All subsequent readings are relative to this baseline.
 *   - The player can recalibrate at any time by tapping the tilt button
 *     (or via a dedicated calibrate button).
 *
 * Smoothing:
 *   - Simple exponential moving average: smoothed = α * raw + (1-α) * smoothed
 *   - α = 0.2 gives ~5-sample effective window (100ms at 60Hz) — responsive
 *     but not jittery.
 */

import { DeviceMotion, type NormalizedMotion } from './DeviceMotion';

export interface TiltState {
  /** Gravity X in game units (px/tick²). Positive = right. */
  gx: number;
  /** Gravity Y in game units (px/tick²). Positive = down. */
  gy: number;
  /** Raw tilt in degrees for UI feedback. */
  tiltDegrees: number;
}

const SMOOTHING_ALPHA = 0.2;
const MAX_TILT_DEGREES = 45; // Clamp at ±45° tilt
const MAX_LATERAL_GRAVITY = 1.5; // Max |gx| in game units
const BASE_DOWNWARD_GRAVITY = 1.2; // Default Matter gravity.y when no tilt

class TiltControllerClass {
  private enabled: boolean = false;
  private baselineX: number = 0; // m/s² at calibration time
  private baselineY: number = 0;
  private smoothedX: number = 0; // smoothed delta from baseline
  private smoothedY: number = 0;

  /**
   * Enable tilt control. Captures the current phone orientation as the
   * "neutral" baseline — the player should hold the phone in their
   * preferred playing position before enabling.
   *
   * Returns true if successfully started, false if DeviceMotion is not
   * available or permission was denied.
   */
  async enable(): Promise<boolean> {
    if (!DeviceMotion.isSupported()) {
      console.warn('[TiltController] DeviceMotion not supported');
      return false;
    }

    const granted = await DeviceMotion.requestPermission();
    if (!granted) {
      console.warn('[TiltController] permission denied');
      return false;
    }

    // Start listening. The first sample will be used for calibration.
    let calibrated = false;
    DeviceMotion.start((motion: NormalizedMotion) => {
      if (!calibrated) {
        // First reading becomes the baseline.
        this.baselineX = motion.x;
        this.baselineY = motion.y;
        this.smoothedX = 0;
        this.smoothedY = 0;
        calibrated = true;
        console.info(
          `[TiltController] calibrated. Baseline=(${this.baselineX.toFixed(2)}, ${this.baselineY.toFixed(2)})`
        );
        return;
      }
      this.handleSample(motion);
    });

    this.enabled = true;
    return true;
  }

  disable(): void {
    DeviceMotion.stop();
    this.enabled = false;
    this.smoothedX = 0;
    this.smoothedY = 0;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Recalibrate the baseline to the current phone orientation.
   * Useful if the player shifts position and wants a new "neutral".
   */
  recalibrate(): void {
    // Mark for recalibration on next sample.
    // We do this by stopping+starting, which forces the calibration flag
    // to reset on the first new sample.
    if (!this.enabled) return;
    DeviceMotion.stop();
    this.smoothedX = 0;
    this.smoothedY = 0;
    let calibrated = false;
    DeviceMotion.start((motion: NormalizedMotion) => {
      if (!calibrated) {
        this.baselineX = motion.x;
        this.baselineY = motion.y;
        calibrated = true;
        return;
      }
      this.handleSample(motion);
    });
  }

  /**
   * Get the current gravity vector to apply to the Matter world.
   * Returns the default downward gravity if tilt is disabled.
   */
  getGravity(): { x: number; y: number } {
    if (!this.enabled) {
      return { x: 0, y: BASE_DOWNWARD_GRAVITY };
    }
    return {
      x: this.smoothedX,
      y: BASE_DOWNWARD_GRAVITY + this.smoothedY
    };
  }

  /**
   * Get the current tilt angle in degrees (for UI feedback like an
   * indicator showing which way cubes will roll).
   */
  getTiltDegrees(): number {
    // atan2(lateral, vertical) gives the tilt angle.
    // lateral = smoothedX (m/s²), vertical ≈ 9.8 (gravity magnitude).
    // We use the smoothed delta vs baseline, scaled to physical units.
    if (!this.enabled) return 0;
    const lateral = this.smoothedX * 9.8 / 1.5; // back to m/s²-ish
    const angle = Math.atan2(lateral, 9.8) * (180 / Math.PI);
    return Math.max(-MAX_TILT_DEGREES, Math.min(MAX_TILT_DEGREES, angle));
  }

  private handleSample(motion: NormalizedMotion): void {
    // Delta from baseline.
    const dx = motion.x - this.baselineX;
    const dy = motion.y - this.baselineY;

    // Exponential smoothing.
    this.smoothedX = SMOOTHING_ALPHA * dx + (1 - SMOOTHING_ALPHA) * this.smoothedX;
    this.smoothedY = SMOOTHING_ALPHA * dy + (1 - SMOOTHING_ALPHA) * this.smoothedY;

    // Map m/s² to game gravity units.
    // At full tilt (~45°), dx ≈ ±9.8 m/s². We want this to map to ±1.5 game units.
    // Scale factor: 1.5 / 9.8 ≈ 0.153
    const scale = MAX_LATERAL_GRAVITY / 9.8;
    let gx = this.smoothedX * scale;

    // Clamp to prevent extreme gravity.
    gx = Math.max(-MAX_LATERAL_GRAVITY, Math.min(MAX_LATERAL_GRAVITY, gx));

    // For Y (forward/back tilt), we want smaller effect — mostly affects
    // fall speed. Cap at ±0.6 game units (50% of base gravity).
    const gyScale = 0.6 / 9.8;
    let gy = this.smoothedY * gyScale;
    gy = Math.max(-0.6, Math.min(0.6, gy));

    this.smoothedX = gx;
    this.smoothedY = gy;
  }
}

// Singleton.
export const TiltController = new TiltControllerClass();
