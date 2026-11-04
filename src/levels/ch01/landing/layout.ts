import type { PatrolDef } from '../../../gameplay/modules/stealth';
import type { SweepLightDef } from './sweep';

/**
 * Night Landing (Aliyah Bet, 1946): all coordinates and tuning in one place (meters, XZ plane,
 * heading 0 faces +z). The coast is the stylized 'coastalPlain' terrain: sea to the west (-x),
 * waterline near x = -77, rolling dunes inland. Everything here is RECONSTRUCTED staging; the
 * only documented facts are in the locale texts (sources C1-055, C1-002, C1-101).
 */

export const TERRAIN_SIZE = 384;
export const WATER_LEVEL = 0;

/** The sea the boat may use (the boat is a circle of BOAT_RADIUS inside this rectangle). */
export const SEA_BOUNDS = { minX: -186, maxX: -90, minZ: -70, maxZ: 186 } as const;
export const BOAT_RADIUS = 1.2;

export const BOAT_SPAWN = { x: -168, z: 158, heading: Math.PI } as const;
export const SHIP_POS = { x: -178, z: 178, ry: Math.PI } as const;

/** Where the boat meets the beach, and the beached launch. */
export const COVE = { x: -92, z: -56, radius: 3.6 } as const;
export const LAUNCH = { x: -86, z: -56, ry: Math.PI / 2 } as const;
/** First dry sand; the player starts here on foot. */
export const BEACH_START = { x: -73, z: -53, heading: Math.PI / 2 } as const;

/** Sea goals: the lantern the boat steers to, the hold spot between patrol lanes, the far side. */
export const SEA_GOAL = { x: -146, z: 104, radius: 4 } as const;
export const PATROLS_GOAL = { x: -146, z: 10, radius: 4 } as const;

export const PATROLS: readonly PatrolDef[] = [
  // Tutorial patrol far to the west: only a preview of the telegraphed cone (never near the route).
  { id: 'preview', path: [[-183, 150], [-183, 98]], speed: 2.2, viewRange: 30, viewHalfAngle: 0.4, pause: 3 },
  // Two patrol lanes the boat must cross; a patrol only sees ahead, never behind.
  { id: 'lane-1', path: [[-184, 72], [-102, 72]], speed: 3.4, viewRange: 34, viewHalfAngle: 0.38, pause: 2.5 },
  { id: 'lane-2', path: [[-102, 36], [-184, 36]], speed: 3.4, viewRange: 34, viewHalfAngle: 0.38, pause: 2.5 },
];

/** Two shore searchlights; the beam is dark between sweeps and a tick sounds before each sweep. */
export const LIGHTS: readonly SweepLightDef[] = [
  { id: 'light-1', x: -74, z: -4, heading: -Math.PI / 2, arc: 0.7, halfAngle: 0.3, range: 84, sweepTime: 9, restTime: 6, offset: 0, tickLead: 2 },
  { id: 'light-2', x: -74, z: -34, heading: -Math.PI / 2, arc: 0.7, halfAngle: 0.3, range: 84, sweepTime: 9, restTime: 6, offset: 7.5, tickLead: 2 },
];

/** Land watchers: two lantern bearers who walk a line across the beach path. */
export const WATCHERS: readonly PatrolDef[] = [
  { id: 'watch-1', path: [[-64, -22], [-36, -44]], speed: 2, viewRange: 22, viewHalfAngle: 0.4, pause: 4 },
];

/** Rocks and wrecks at sea: solid for the boat and cover from beams and patrol cones. */
export const SEA_ROCKS: readonly { readonly x: number; readonly z: number; readonly r: number }[] = [
  { x: -158, z: 94, r: 3.2 },
  { x: -128, z: -12, r: 3.4 },
  { x: -136, z: -50, r: 3.4 },
  { x: -112, z: -62, r: 3.2 },
  { x: -168, z: -40, r: 3.0 },
  { x: -120, z: 118, r: 3.0 },
];

/** Beach walk. */
export const SHORE_ROUTE = [
  { x: -61, z: -47 },
  { x: -38, z: -18 },
] as const;
export const TRUCKS = { x: -22, z: -12, radius: 9 } as const;
export const HOLLOW = { x: -8, z: -2, radius: 5.5 } as const;
export const LOST_CHILD = { x: -75, z: -34 } as const;
export const BUNDLES: readonly { readonly x: number; readonly z: number }[] = [
  { x: -70, z: -49 },
  { x: -71, z: -57 },
];

/** Beach cover (dune shoulders that block a watcher's sight). */
export const DUNE_COVER: readonly { readonly x: number; readonly z: number; readonly r: number }[] = [
  { x: -60, z: -30, r: 3.6 },
  { x: -52, z: -46, r: 3.6 },
];

/** Survivors (all FICTIONAL COMPOSITES): children first, then elders, then adults. */
export const SURVIVOR_GROUPS = [
  { kind: 'child', count: 3, trip: 0 },
  { kind: 'elder', count: 3, trip: 0 },
  { kind: 'adult', count: 4, trip: 1 },
] as const;

/** Base timers in seconds (scaled by difficulty); the sky turns grey as they run down. */
export const TIMERS = { drop: 240, landing: 150, shore: 330 } as const;

/** Meters from the leader inside which a survivor counts as "with you". */
export const WITH_YOU_RADIUS = 11;
export const CHILD_VOICE_RANGE = 42;
export const CHILD_VOICE_GAP = 5;
export const CHILD_FIND_RADIUS = 2.6;

/**
 * Second rescue wave (missions.md beat 5: children and elders first). The first small boat carries
 * the children and the elders (trip 0); the boat then goes back to the ship for the adults (trip 1).
 * Each sea stage has its own patrol lanes and searchlight phase ("set"), so the later crossings are
 * never a copy of the first. Fixed rhythms, restarted at every checkpoint.
 */
export type SeaSet = 'A' | 'B' | 'C';

/** Alongside the ship: the end of the return crossing. */
export const RETURN_GOAL = { x: -166, z: 150, radius: 4 } as const;
/** Where the boat leaves the cove for the return crossing. */
export const RETURN_START = { x: -99, z: -60, heading: -Math.PI / 2 } as const;

export const PATROLS_B: readonly PatrolDef[] = [
  { id: 'back-1', path: [[-184, 28], [-102, 28]], speed: 3, viewRange: 34, viewHalfAngle: 0.38, pause: 2 },
  { id: 'back-2', path: [[-102, 64], [-184, 64]], speed: 3.6, viewRange: 34, viewHalfAngle: 0.38, pause: 2.5 },
];
export const PATROLS_C: readonly PatrolDef[] = [
  { id: 'cross-1', path: [[-184, 104], [-102, 104]], speed: 3.2, viewRange: 34, viewHalfAngle: 0.38, pause: 2 },
  { id: 'cross-2', path: [[-102, 70], [-184, 70]], speed: 3.8, viewRange: 34, viewHalfAngle: 0.38, pause: 2 },
];

const SWEEP = { heading: -Math.PI / 2, arc: 0.7, halfAngle: 0.3, range: 84, sweepTime: 9, restTime: 6, tickLead: 2 } as const;
/** Same beams, other phase: the quiet windows move (the tick still sounds 2 s before every sweep). */
export const LIGHTS_B: readonly SweepLightDef[] = [
  { id: 'light-1', x: -74, z: -4, ...SWEEP, offset: 9 },
  { id: 'light-2', x: -74, z: -34, ...SWEEP, offset: 3.5 },
];
export const LIGHTS_C: readonly SweepLightDef[] = [
  { id: 'light-1', x: -74, z: -4, ...SWEEP, offset: 9 },
  { id: 'light-2', x: -74, z: -34, ...SWEEP, offset: 0 },
];

export const PATROL_SETS: Readonly<Record<SeaSet, readonly PatrolDef[]>> = { A: PATROLS, B: PATROLS_B, C: PATROLS_C };
export const LIGHT_SETS: Readonly<Record<SeaSet, readonly SweepLightDef[]>> = { A: LIGHTS, B: LIGHTS_B, C: LIGHTS_C };

/** Where the first load is sheltered by the volunteers, beside the hollow. */
export const SHELTER = { x: -5.5, z: 1.5 } as const;
