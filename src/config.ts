/**
 * Game configuration constants.
 * Centralizes all tunable parameters so designers can balance the game
 * without hunting through the code.
 */

// Logical game resolution (Phaser scales this to fit the screen).
// Portrait orientation, mobile-first.
export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 960;

// Playfield geometry (the area where cubes can fall and stack).
// FIELD_BOTTOM leaves 130px at the bottom of the screen reserved for the
// banner ad overlay (banner is 100dp tall + 30px safety margin). The banner
// is a native Android view anchored to the bottom of the screen; without
// this margin it would overlap the bottom row of stacked cubes.
export const FIELD_LEFT = 30;
export const FIELD_RIGHT = GAME_WIDTH - 30;
export const FIELD_TOP = 220;
export const FIELD_BOTTOM = GAME_HEIGHT - 130;
export const FIELD_WIDTH = FIELD_RIGHT - FIELD_LEFT;

// The danger line: if any cube stays above this line for too long,
// it's game over.
export const DANGER_LINE_Y = 200;
export const DANGER_GRACE_MS = 1500; // how long a cube can stay above the line

// Spawn position (top center of the playfield).
export const SPAWN_X = GAME_WIDTH / 2;
export const SPAWN_Y = 110;

// Physics tuning for cubes.
// We want cubes to ROTATE and ROLL naturally (like real wooden blocks),
// but motion should dampen over time so the field eventually settles.
//
// - friction (cube↔cube and cube↔wall): high enough that cubes grip
//   each other and roll down slopes, but not so high they stick forever.
// - frictionStatic: low so a cube can start sliding when something pushes it.
// - frictionAir: dampens BOTH linear AND angular velocity every tick.
//   This is the key parameter for "rolling damping" — without it, a cube
//   that starts spinning will spin forever.
// - restitution: low, so cubes don't bounce and perpetuate motion.
// - chamfer: small rounded corners so cubes actually roll on edges
//   instead of catching on sharp 90° corners.
export const CUBE_PHYSICS = {
  restitution: 0.05,
  friction: 0.4,
  frictionStatic: 0.3,
  frictionAir: 0.025,
  density: 0.002,
  isStatic: false,
  chamfer: { radius: 6 }
};

// Wall (floor + side walls) friction tuning.
// Lower friction here so cubes can slide along walls and settle at the bottom.
export const WALL_PHYSICS = {
  isStatic: true,
  friction: 0.3,
  restitution: 0.05
};

// Launch tuning: how fast the cube is thrown toward the tap point.
//
// LAUNCH_SPEED is the BASE speed used by the solver when no specific
// solution is needed — currently unused since the solver always picks a
// speed based on the trajectory.
//
// LAUNCH_MAX_SPEED caps the maximum initial velocity. The ballistic solver
// (src/systems/LaunchSolver.ts) searches for a (vx, vy) that lands the cube
// at the tap point, but won't exceed this cap. Set high enough that cubes
// can reach the edges of the field — the solver will use lower speeds for
// close targets automatically.
//
// Old values (9 / 14) were too low — cubes couldn't reach field edges
// before gravity pulled them down, landing 3+ cubes short of the tap.
// 22 allows reaching all corners of the field with the iterative solver.
export const LAUNCH_SPEED = 12;
export const LAUNCH_MAX_SPEED = 22;

// Cooldown before the next cube spawns after a launch.
// Lower = faster gameplay (player can spam-tap).
export const NEXT_CUBE_DELAY_MS = 200;

// "Lock-in" delay: after launching, the launched cube is the "current" cube
// for this many ms before a new floating cube spawns. If the player taps
// again before this elapses, the tap is queued (we'll handle that below).
export const TAP_QUEUE_WINDOW_MS = 180;

// The spawnable cube values (powers of two).
// Larger cubes only appear as the result of merges.
export const SPAWN_VALUES: number[] = [2, 4, 8, 16];
export const SPAWN_WEIGHTS: number[] = [50, 30, 15, 5]; // % probabilities
export const MAX_CUBE_VALUE = 2048;

// Visual style per cube value. Colors inspired by 2048 palette, tuned for visibility.
//
// Size rationale:
//   Field width is 480px (FIELD_LEFT=30, FIELD_RIGHT=510, GAME_WIDTH=540).
//   7 cubes of 64px = 448px + 6 gaps of ~5px = 478px → fits with 2px slack.
//   Previously 8 cubes of 56px fit (8*56=448). We increased the base size
//   by ~14% (56→64) per user request so 7×64 cubes fill the width — this
//   makes the gameplay feel more substantial without crowding the field.
export const CUBE_STYLES: Record<number, { bg: number; text: number; size: number }> = {
  2: { bg: 0xeee4da, text: 0x776e65, size: 64 },
  4: { bg: 0xede0c8, text: 0x776e65, size: 64 },
  8: { bg: 0xf2b179, text: 0xffffff, size: 64 },
  16: { bg: 0xf59563, text: 0xffffff, size: 64 },
  32: { bg: 0xf67c5f, text: 0xffffff, size: 68 },
  64: { bg: 0xf65e3b, text: 0xffffff, size: 68 },
  128: { bg: 0xedcf72, text: 0xffffff, size: 72 },
  256: { bg: 0xedcc61, text: 0xffffff, size: 72 },
  512: { bg: 0xedc850, text: 0xffffff, size: 80 },
  1024: { bg: 0xedc53f, text: 0xffffff, size: 86 },
  2048: { bg: 0xedc22e, text: 0xffffff, size: 90 }
};

export function getCubeSize(value: number): number {
  return CUBE_STYLES[value]?.size ?? 90;
}

export function getCubeColor(value: number): { bg: number; text: number } {
  return CUBE_STYLES[value] ?? { bg: 0x3c3a32, text: 0xffffff };
}

// UI colors
export const COLORS = {
  background: 0x1a1a2e,
  field: 0x16213e,
  fieldBorder: 0x0f3460,
  dangerLine: 0xe94560,
  text: 0xffffff,
  textDim: 0x8a8aa8,
  accent: 0xe94560,
  buttonPrimary: 0xe94560,
  buttonPrimaryHover: 0xff6b81
};

// Ad unit configuration.
//
// Yandex SDK 8.x demo ad unit IDs sometimes return 'no fill' for banner
// format (interstitial and rewarded demos work fine). If the banner
// doesn't appear, check logcat via 'npm run android:log' — look for
// 'Banner failed to load' messages with the YandexAds tag.
//
// For production, replace these with REAL ad unit IDs from the Yandex
// Advertising Network dashboard (https://yandex.ru/dev/mobile-ads/).
// Real IDs have the format 'R-M-XXXXXX-X' (e.g. 'R-M-2252991-1').
//
// Yandex demo IDs:
//   Interstitial:  'demo-interstitial-yandex'
//   Rewarded:      'demo-rewarded-yandex'
//   Banner:        'demo-banner-yandex'  (often returns 'no fill' —
//                                         consider using a real ID for testing)
export const ADS_CONFIG = {
  interstitialAdId: 'demo-interstitial-yandex',
  rewardedAdId: 'demo-rewarded-yandex',
  bannerAdId: 'demo-banner-yandex',
  // Show interstitial after every N deaths (1 = every death, 3 = every 3rd death).
  interstitialEveryDeaths: 3,
  // Minimum gap between interstitials, in ms (Yandex policy: at least 60s).
  interstitialMinGapMs: 60_000
};

// Milestone values: when a cube of this value is created via merge for the
// first time in this playthrough, show a congratulation dialog.
// (After the dialog closes, AdsManager.maybeShowInterstitialOnMilestone is called.)
export const MILESTONE_VALUES: number[] = [32, 64, 128, 256, 512, 1024, 2048];

// Shockwave applied to nearby cubes when a merge happens.
// - radius: how far the wave reaches (in pixels)
// - strength: max impulse applied at the epicenter; falls off with distance
// - uplift: extra upward component so cubes "jump" a bit
export const SHOCKWAVE = {
  radius: 180,
  strength: 6,
  uplift: 2
};

// Local storage keys.
export const STORAGE_KEYS = {
  bestScore: 'box2048_best_score',
  totalDeaths: 'box2048_total_deaths',
  language: 'box2048_language',
  // Saved game state: cubes on the field + score + next cube + milestones.
  // Used to resume the game from where the player left off after closing
  // the app or returning to the menu.
  savedState: 'box2048_saved_state'
};

// Supported languages. 'ru' is the default for the project's target audience.
export const DEFAULT_LANGUAGE: 'ru' | 'en' = 'ru';
export const SUPPORTED_LANGUAGES: Array<'ru' | 'en'> = ['ru', 'en'];
