/**
 * DeviceMotion: cross-platform wrapper around the W3C DeviceMotionEvent API.
 *
 * Works in:
 *   - Modern browsers (Chrome Android, Firefox Android) — permissionless.
 *   - iOS Safari 13+ — requires DeviceMotionEvent.requestPermission(), which
 *     MUST be called from a user gesture (e.g. a button tap).
 *   - Capacitor WebView — same API works since it's a WebView.
 *
 * Exposes:
 *   - isSupported(): whether the API exists at all.
 *   - requestPermission(): iOS gesture-bound permission request. No-op on
 *     other platforms.
 *   - start(callback): subscribe to motion updates. Callback receives
 *     normalized acceleration in m/s² (gravity included, no user accel).
 *   - stop(): unsubscribe.
 *
 * Acceleration values:
 *   - x: positive when device is tilted right (right edge down)
 *   - y: positive when device is tilted forward (top edge down)
 *   - z: positive when device is face-up on a table (≈ 9.8 m/s²)
 *
 * For our game we only use x and y — tilting left/right shifts cubes
 * sideways, tilting forward/back changes the fall speed slightly.
 */

export interface NormalizedMotion {
  /** m/s². Positive = device tilted right (right edge down). */
  x: number;
  /** m/s². Positive = device tilted forward (top edge down). */
  y: number;
  /** m/s². Positive = face up. ≈ 9.8 at rest. */
  z: number;
}

type MotionCallback = (motion: NormalizedMotion) => void;

class DeviceMotionSystem {
  private listener: ((e: DeviceMotionEvent) => void) | null = null;
  private callback: MotionCallback | null = null;
  private listening: boolean = false;

  /**
   * True if the DeviceMotionEvent API is available at all.
   * Note: on iOS, availability doesn't mean permission is granted —
   * use requestPermission() first.
   */
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
  }

  /**
   * On iOS 13+, request permission. MUST be called from a user gesture
   * (e.g. button tap). On other platforms, resolves to true immediately.
   *
   * Returns true if permission was granted (or wasn't needed).
   */
  async requestPermission(): Promise<boolean> {
    const DME = (window as any).DeviceMotionEvent;
    if (DME && typeof DME.requestPermission === 'function') {
      try {
        const result = await DME.requestPermission();
        return result === 'granted';
      } catch (e) {
        console.warn('[DeviceMotion] permission request failed:', e);
        return false;
      }
    }
    // Non-iOS — no permission needed.
    return true;
  }

  /**
   * Start listening for motion updates. The callback fires at the device's
   * native sensor rate (typically 60Hz on phones).
   *
   * Safe to call multiple times — re-subscribes cleanly.
   */
  start(callback: MotionCallback): void {
    if (!this.isSupported()) {
      console.warn('[DeviceMotion] not supported on this device');
      return;
    }
    // Clean up any existing listener first.
    this.stop();
    this.callback = callback;
    this.listener = (e: DeviceMotionEvent) => this.handleEvent(e);
    window.addEventListener('devicemotion', this.listener);
    this.listening = true;
  }

  stop(): void {
    if (this.listener) {
      window.removeEventListener('devicemotion', this.listener);
      this.listener = null;
    }
    this.callback = null;
    this.listening = false;
  }

  isListening(): boolean {
    return this.listening;
  }

  /**
   * Convert the raw DeviceMotionEvent to a NormalizedMotion.
   *
   * We prefer accelerationIncludingGravity because it gives us the gravity
   * vector directly — perfect for tilt detection. If only `acceleration`
   * (which excludes gravity) is available, we fall back to it, but then
   * we can't detect tilt at rest (only motion).
   */
  private handleEvent(e: DeviceMotionEvent): void {
    if (!this.callback) return;

    // Prefer accelerationIncludingGravity — it always has the gravity vector.
    const a = e.accelerationIncludingGravity;
    if (a) {
      this.callback({
        x: a.x ?? 0,
        y: a.y ?? 0,
        z: a.z ?? 0
      });
      return;
    }

    // Fall back to acceleration (gravity removed). Won't detect tilt at rest
    // but at least we'll get motion data.
    const a2 = e.acceleration;
    if (a2) {
      this.callback({
        x: a2.x ?? 0,
        y: a2.y ?? 0,
        z: a2.z ?? 0
      });
    }
  }
}

// Singleton — there's no reason to have multiple motion listeners.
export const DeviceMotion = new DeviceMotionSystem();
