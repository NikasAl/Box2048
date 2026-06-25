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
export const FIELD_LEFT = 30;
export const FIELD_RIGHT = GAME_WIDTH - 30;
export const FIELD_TOP = 220; // cubes spawn above this line
export const FIELD_BOTTOM = GAME_HEIGHT - 30;
export const FIELD_WIDTH = FIELD_RIGHT - FIELD_LEFT;

// The danger line: if any cube stays above this line for too long,
// it's game over.
export const DANGER_LINE_Y = 200;
export const DANGER_GRACE_MS = 1500; // how long a cube can stay above the line

// Spawn position (top center of the playfield).
export const SPAWN_X = GAME_WIDTH / 2;
export const SPAWN_Y = 110;

// Physics tuning for cubes.
export const CUBE_PHYSICS = {
  restitution: 0.15, // bounciness
  friction: 0.4,
  frictionStatic: 0.6,
  density: 0.002,
  isStatic: false,
  chamfer: { radius: 8 } // rounded corners
};

// Launch tuning: how fast the cube is thrown toward the tap point.
export const LAUNCH_SPEED = 9; // px per physics tick (Matter scales internally)
export const LAUNCH_MAX_SPEED = 14;

// Cooldown before the next cube spawns after a launch.
export const NEXT_CUBE_DELAY_MS = 600;

// The spawnable cube values (powers of two).
// Larger cubes only appear as the result of merges.
export const SPAWN_VALUES: number[] = [2, 4, 8, 16];
export const SPAWN_WEIGHTS: number[] = [50, 30, 15, 5]; // % probabilities
export const MAX_CUBE_VALUE = 2048;

// Visual style per cube value. Colors inspired by 2048 palette, tuned for visibility.
export const CUBE_STYLES: Record<number, { bg: number; text: number; size: number }> = {
  2: { bg: 0xeee4da, text: 0x776e65, size: 56 },
  4: { bg: 0xede0c8, text: 0x776e65, size: 56 },
  8: { bg: 0xf2b179, text: 0xffffff, size: 56 },
  16: { bg: 0xf59563, text: 0xffffff, size: 56 },
  32: { bg: 0xf67c5f, text: 0xffffff, size: 60 },
  64: { bg: 0xf65e3b, text: 0xffffff, size: 60 },
  128: { bg: 0xedcf72, text: 0xffffff, size: 64 },
  256: { bg: 0xedcc61, text: 0xffffff, size: 64 },
  512: { bg: 0xedc850, text: 0xffffff, size: 70 },
  1024: { bg: 0xedc53f, text: 0xffffff, size: 76 },
  2048: { bg: 0xedc22e, text: 0xffffff, size: 80 }
};

export function getCubeSize(value: number): number {
  return CUBE_STYLES[value]?.size ?? 80;
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

// Ad unit configuration (override in production via capacitor.config.ts).
export const ADS_CONFIG = {
  interstitialAdId: 'demo-interstitial',
  rewardedAdId: 'demo-rewarded',
  bannerAdId: 'demo-banner',
  // Show interstitial after every N deaths (1 = every death, 3 = every 3rd death).
  interstitialEveryDeaths: 3,
  // Minimum gap between interstitials, in ms (Yandex policy: at least 60s).
  interstitialMinGapMs: 60_000
};

// Local storage keys.
export const STORAGE_KEYS = {
  bestScore: 'box2048_best_score',
  totalDeaths: 'box2048_total_deaths'
};
