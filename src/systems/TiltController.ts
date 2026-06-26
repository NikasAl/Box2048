/**
 * TiltController: turns raw DeviceMotion acceleration into a smooth,
 * calibrated gravity vector for the game.
 *
 * KEY DESIGN DECISION (per user feedback):
 *   The gravity vector is ROTATED with the phone, not just shifted. When
 *   the phone is tilted 90° sideways, the gravity in the game also rotates
 *   90° — cubes fall sideways at full speed (not a weak lateral nudge).
 *   This matches the player's intuition: "низ телефона" becomes "низ игры".
 *
 * Pipeline:
 *   1. Sample raw acceleration (m/s²) from DeviceMotion (accelerationIncludingGravity).
 *   2. Compute the phone's tilt angles using atan2:
 *        angleX = atan2(ax, az)  — sideways tilt (0 = face up, ±π/2 = on side)
 *        angleY = atan2(ay, az)  — forward/back tilt
 *   3. Apply exponential smoothing to the angles (low-pass filter).
 *   4. Subtract the calibration baseline (captured at enable() time).
 *   5. Rotate the default gravity vector (0, G) by the tilt delta:
 *        gx = G * sin(ΔangleX)
 *        gy = G * cos(ΔangleX) * cos(ΔangleY)
 *   6. Result: at 0° tilt → (0, G) normal downward gravity.
 *             at 90° tilt → (G, 0) full sideways gravity.
 *             at 45° tilt → (G*0.707, G*0.707) equal sideways+down.
 *
 * Calibration:
 *   - On enable(), we capture the current phone orientation as the "neutral"
 *     baseline (angleX₀, angleY₀).
 *   - All subsequent angles are relative to this baseline.
 *   - Long-press the tilt button (handled in GameScene) triggers
 *     recalibrate() to re-capture the baseline.
 *
 * Smoothing:
 *   - Exponential moving average on the angles: α = 0.2
 *   - ~100ms effective window at 60Hz — responsive but not jittery.
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
const BASE_DOWNWARD_GRAVITY = 1.2; // Default Matter gravity.y when no tilt
const RAD_TO_DEG = 180 / Math.PI;
const MAX_TILT_RAD = Math.PI / 2; // ±90° — clamp to prevent flipping

class TiltControllerClass {
  private enabled: boolean = false;
  // Baseline angles (radians) captured at calibration time.
  private baselineAngleX: number = 0;
  private baselineAngleY: number = 0;
  // Smoothed absolute angles (radians).
  private smoothedAngleX: number = 0;
  private smoothedAngleY: number = 0;
  // Smoothed delta-from-baseline angles (radians), computed each sample.
  private deltaAngleX: number = 0;
  private deltaAngleY: number = 0;

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

    // Start listening. The first sample calibrates the baseline.
    let calibrated = false;
    DeviceMotion.start((motion: NormalizedMotion) => {
      // Compute absolute tilt angles from the gravity vector.
      // atan2(ax, az): 0 when face-up (az=9.8, ax=0), π/2 when on right side.
      const angleX = Math.atan2(motion.x, motion.z);
      const angleY = Math.atan2(motion.y, motion.z);

      if (!calibrated) {
        this.baselineAngleX = angleX;
        this.baselineAngleY = angleY;
        this.smoothedAngleX = angleX;
        this.smoothedAngleY = angleY;
        this.deltaAngleX = 0;
        this.deltaAngleY = 0;
        calibrated = true;
        console.info(
          `[TiltController] calibrated. Baseline angles: X=${(angleX * RAD_TO_DEG).toFixed(1)}°, Y=${(angleY * RAD_TO_DEG).toFixed(1)}°`
        );
        return;
      }

      // Smooth the absolute angles.
      this.smoothedAngleX = SMOOTHING_ALPHA * angleX + (1 - SMOOTHING_ALPHA) * this.smoothedAngleX;
      this.smoothedAngleY = SMOOTHING_ALPHA * angleY + (1 - SMOOTHING_ALPHA) * this.smoothedAngleY;

      // Delta from baseline.
      this.deltaAngleX = this.smoothedAngleX - this.baselineAngleX;
      this.deltaAngleY = this.smoothedAngleY - this.baselineAngleY;

      // Clamp to ±90° to prevent the gravity from flipping sign
      // (which would cause cubes to fly upward if phone is upside-down).
      this.deltaAngleX = Math.max(-MAX_TILT_RAD, Math.min(MAX_TILT_RAD, this.deltaAngleX));
      this.deltaAngleY = Math.max(-MAX_TILT_RAD, Math.min(MAX_TILT_RAD, this.deltaAngleY));
    });

    this.enabled = true;
    return true;
  }

  disable(): void {
    DeviceMotion.stop();
    this.enabled = false;
    this.deltaAngleX = 0;
    this.deltaAngleY = 0;
    this.smoothedAngleX = 0;
    this.smoothedAngleY = 0;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Recalibrate the baseline to the current phone orientation.
   * Useful if the player shifts position and wants a new "neutral".
   * Triggered by long-pressing the tilt button.
   */
  recalibrate(): void {
    if (!this.enabled) return;
    // Reset calibration flag by restarting the listener.
    DeviceMotion.stop();
    this.smoothedAngleX = 0;
    this.smoothedAngleY = 0;
    this.deltaAngleX = 0;
    this.deltaAngleY = 0;
    let calibrated = false;
    DeviceMotion.start((motion: NormalizedMotion) => {
      const angleX = Math.atan2(motion.x, motion.z);
      const angleY = Math.atan2(motion.y, motion.z);
      if (!calibrated) {
        this.baselineAngleX = angleX;
        this.baselineAngleY = angleY;
        this.smoothedAngleX = angleX;
        this.smoothedAngleY = angleY;
        calibrated = true;
        console.info(
          `[TiltController] recalibrated. New baseline: X=${(angleX * RAD_TO_DEG).toFixed(1)}°, Y=${(angleY * RAD_TO_DEG).toFixed(1)}°`
        );
        return;
      }
      this.smoothedAngleX = SMOOTHING_ALPHA * angleX + (1 - SMOOTHING_ALPHA) * this.smoothedAngleX;
      this.smoothedAngleY = SMOOTHING_ALPHA * angleY + (1 - SMOOTHING_ALPHA) * this.smoothedAngleY;
      this.deltaAngleX = Math.max(-MAX_TILT_RAD, Math.min(MAX_TILT_RAD, this.smoothedAngleX - this.baselineAngleX));
      this.deltaAngleY = Math.max(-MAX_TILT_RAD, Math.min(MAX_TILT_RAD, this.smoothedAngleY - this.baselineAngleY));
    });
  }

  /**
   * Get the current gravity vector to apply to the Matter world.
   * Rotates the default (0, BASE_DOWNWARD_GRAVITY) by the tilt delta.
   *
   * At 0° tilt → (0, G) normal downward.
   * At 90° tilt sideways → (G, 0) full sideways.
   * At 45° tilt → (G*0.707, G*0.707) — equal sideways + down.
   */
  getGravity(): { x: number; y: number } {
    if (!this.enabled) {
      return { x: 0, y: BASE_DOWNWARD_GRAVITY };
    }
    const sinX = Math.sin(this.deltaAngleX);
    const cosX = Math.cos(this.deltaAngleX);
    const cosY = Math.cos(this.deltaAngleY);
    return {
      x: BASE_DOWNWARD_GRAVITY * sinX,
      y: BASE_DOWNWARD_GRAVITY * cosX * cosY
    };
  }

  /**
   * Get the current tilt angle in degrees (for UI feedback).
   * Returns the sideways tilt delta relative to calibration baseline.
   * Range: -90 (left) to +90 (right).
   */
  getTiltDegrees(): number {
    if (!this.enabled) return 0;
    return this.deltaAngleX * RAD_TO_DEG;
  }

  /**
   * Get forward/back tilt in degrees. Positive = tilted forward (top edge down).
   * Used for the indicator's vertical component.
   */
  getTiltDegreesY(): number {
    if (!this.enabled) return 0;
    return this.deltaAngleY * RAD_TO_DEG;
  }
}

// Singleton.
export const TiltController = new TiltControllerClass();
