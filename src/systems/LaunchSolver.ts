/**
 * LaunchSolver: computes the initial velocity (vx, vy) needed to launch a
 * cube from (startX, startY) so that it lands at (targetX, targetY), taking
 * gravity and air friction into account.
 *
 * Why this exists:
 *   The naive approach (constant speed toward target) doesn't account for
 *   gravity. The cube follows a parabolic arc and lands short of the target
 *   — especially for far horizontal targets where flight time is long and
 *   gravity has more time to pull the cube down. Players tapping near the
 *   edges of the field saw cubes land several cubes short of the target.
 *
 * Physics model (matches Phaser's Matter integration at 60Hz):
 *   - Effective gravity per tick = gravity.y * 0.001 * deltaTime²
 *                                 = 1.2 * 0.001 * 16.666² ≈ 0.333 px/tick²
 *   - frictionAir = 0.025 per tick → velocity multiplied by 0.975 each tick
 *   - One tick = 1/60 second
 *
 * Algorithm (two-stage):
 *
 *   Stage 1 — Inner solve (analytical + simulated):
 *     For a candidate flight time T (in ticks), compute (vx, vy) using the
 *     analytical ballistic formula (ignoring friction):
 *        vx = dx / T
 *        vy = (dy - 0.5 * g * T²) / T
 *     This guarantees landing at (aimX, aimY) in vacuum.
 *     Then simulate the trajectory WITH friction, find actual landing X.
 *     Try different T values (10–150 ticks, step 0.5), pick the one with
 *     smallest landing error.
 *
 *   Stage 2 — Outer iteration (compensate for friction):
 *     The inner solve aims directly at (targetX, targetY), but due to
 *     friction the cube still lands short. We iteratively adjust aimX
 *     by the X error: aimX = targetX + errorX. This negative feedback
 *     converges to a solution where the actual landing matches the target.
 *     Typically 2–3 iterations suffice.
 *
 * Performance:
 *   Max ~5 outer iterations × ~280 inner T values × ~50-step simulation
 *   = ~70,000 ops per launch. Runs only on tap (not per frame), so it's
 *   negligible. Even on a low-end phone, this completes in <1ms.
 */

// Effective gravity per physics tick, in px/tick².
// Computed from: gravity.y (1.2) × gravityScale (0.001) × deltaTime² (16.666²)
// This must match the Matter world configuration in src/main.ts.
const G_EFFECTIVE = 0.333;

// frictionAir from CUBE_PHYSICS — velocity is multiplied by (1 - frictionAir)
// each tick.
const FRICTION_AIR = 0.025;
const FRICTION_FACTOR = 1 - FRICTION_AIR; // 0.975

export interface LaunchSolution {
  vx: number;
  vy: number;
  flightTimeTicks: number;
  landingErrorPx: number;
}

/**
 * Simulate the trajectory of a cube launched with (vx, vy) from (startX, startY).
 * Returns the (x, y) position and tick count when the cube reaches targetY
 * (i.e. when it's at or just past the target's vertical level while descending).
 *
 * The simulation matches Matter's integration:
 *   velY += gravity
 *   velX *= friction
 *   velY *= friction
 *   x += velX
 *   y += velY
 */
function simulateLanding(
  startX: number,
  startY: number,
  vx: number,
  vy: number,
  targetY: number,
  maxTicks = 400
): { x: number; y: number; ticks: number; reached: boolean } {
  let x = startX;
  let y = startY;
  let velX = vx;
  let velY = vy;

  for (let t = 0; t < maxTicks; t++) {
    // Order matches Matter's Body.update: gravity → friction → position.
    velY += G_EFFECTIVE;
    velX *= FRICTION_FACTOR;
    velY *= FRICTION_FACTOR;
    x += velX;
    y += velY;

    // Stop when descending and at/below targetY (i.e. landed at target altitude).
    if (velY > 0 && y >= targetY) {
      return { x, y, ticks: t, reached: true };
    }
  }
  return { x, y, ticks: maxTicks, reached: false };
}

/**
 * Inner solve: given an aim point (aimX, aimY), find the (vx, vy) that lands
 * closest to aimX at targetY altitude. Searches over flight time T.
 *
 * Returns the best solution found, or { error: Infinity } if no feasible T
 * exists within maxSpeed.
 */
function innerSolve(
  startX: number,
  startY: number,
  aimX: number,
  aimY: number,
  targetY: number,
  maxSpeed: number
): { vx: number; vy: number; T: number; error: number } {
  const dx = aimX - startX;
  const dy = aimY - startY;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
    return { vx: 0, vy: 0, T: 0, error: 0 };
  }

  let best = { vx: 0, vy: 0, T: 0, error: Infinity };

  // Search over flight time T (in ticks). Range covers short arcs (10 ticks
  // ≈ 0.17s, fast direct throw) to long arcs (150 ticks ≈ 2.5s, lobbed throw).
  // Step of 0.5 ticks gives fine-grained precision without too many iterations.
  for (let T = 10; T <= 150; T += 0.5) {
    // Analytical ballistic solution (ignoring friction):
    //   x(T) = startX + vx*T           → vx = dx / T
    //   y(T) = startY + vy*T + 0.5*g*T² → vy = (dy - 0.5*g*T²) / T
    const vx = dx / T;
    const vy = (dy - 0.5 * G_EFFECTIVE * T * T) / T;

    // Skip if speed exceeds max.
    const speed = Math.hypot(vx, vy);
    if (speed > maxSpeed) continue;

    // Simulate WITH friction to find actual landing.
    const landing = simulateLanding(startX, startY, vx, vy, targetY);
    if (!landing.reached) continue; // never reached target altitude

    const error = Math.abs(aimX - landing.x);
    if (error < best.error) {
      best = { vx, vy, T, error };
      // Early exit if we're within 0.5 pixels — excellent precision.
      if (error < 0.5) break;
    }
  }

  return best;
}

/**
 * Solve for (vx, vy) that lands the cube at (targetX, targetY).
 *
 * @param startX  Launch position X (cube's current X).
 * @param startY  Launch position Y (cube's current Y).
 * @param targetX Where the player tapped (clamped to field).
 * @param targetY Where the player tapped (clamped to field).
 * @param maxSpeed  Maximum allowed initial speed (|v|). Default Infinity.
 * @returns LaunchSolution with vx, vy, flight time, and landing error in pixels.
 */
export function solveLaunch(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  maxSpeed = Infinity
): LaunchSolution {
  // Stage 1: initial solve aiming directly at target.
  let best = innerSolve(startX, startY, targetX, targetY, targetY, maxSpeed);

  // Stage 2: iteratively adjust aimX to compensate for friction-induced
  // landing error. Each iteration:
  //   1. Simulate landing with current (vx, vy)
  //   2. Compute X error (targetX - landing.x)
  //   3. If small enough, stop
  //   4. Otherwise, adjust aimX = targetX + errorX (negative feedback)
  //   5. Re-solve with new aimX
  let aimX = targetX;
  const aimY = targetY;
  for (let iter = 0; iter < 5; iter++) {
    if (best.error < 1) break; // Close enough — stop iterating.

    // Simulate with current best (vx, vy) to find actual landing X.
    const landing = simulateLanding(startX, startY, best.vx, best.vy, targetY);
    if (!landing.reached) break;

    const errorX = targetX - landing.x;
    if (Math.abs(errorX) < 1) break;

    // Adjust aimX by the error to compensate (negative feedback).
    // If we landed short (errorX > 0), aim further; if long, aim shorter.
    aimX = targetX + errorX;
    best = innerSolve(startX, startY, aimX, aimY, targetY, maxSpeed);
  }

  // Final check: how far from the real target?
  const finalLanding = simulateLanding(startX, startY, best.vx, best.vy, targetY);
  const finalError = finalLanding.reached ? Math.abs(targetX - finalLanding.x) : -1;

  // If no solution was found at all (e.g. target is too far for any feasible
  // throw within maxSpeed), fall back to a direct throw capped at maxSpeed.
  if (!isFinite(best.error) || best.error === Infinity) {
    const dx = targetX - startX;
    const dy = targetY - startY;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const fallbackSpeed = isFinite(maxSpeed) ? Math.min(maxSpeed, dist) : dist;
    return {
      vx: (dx / dist) * fallbackSpeed,
      vy: (dy / dist) * fallbackSpeed,
      flightTimeTicks: 0,
      landingErrorPx: -1
    };
  }

  return {
    vx: best.vx,
    vy: best.vy,
    flightTimeTicks: best.T,
    landingErrorPx: finalError
  };
}
