import type { RoadSpec } from '../../../world/roads';

/**
 * Layout of "Letters from Jaffa" (stylized, not survey-accurate: distances are compressed so one
 * courier day fits one map). Pure data, shared by the level, its unit tests and the E2E. World
 * units are meters; heading 0 faces +z, +x is east, the sea is to the west.
 */

export const WORLD_SIZE = 384;
export const WORLD_SEED = 'jaffa-letters-1890s';

export interface Pt {
  readonly x: number;
  readonly z: number;
}

const p = (x: number, z: number): Pt => ({ x, z });

// ---- roads ---------------------------------------------------------------------------------------

export const ROAD_MAIN_POINTS: readonly (readonly [number, number])[] = [
  [-34, 12],
  [-24, 30],
  [-20, 56],
  [-8, 82],
  [10, 98],
  [32, 120],
  [54, 138],
  [76, 148],
];
export const PATH_VILLAGE_POINTS: readonly (readonly [number, number])[] = [
  [10, 98],
  [28, 86],
  [46, 76],
  [60, 67],
  [70, 60],
];
export const PATH_STATION_POINTS: readonly (readonly [number, number])[] = [
  [70, 60],
  [56, 54],
  [38, 48],
  [22, 46],
  [14, 46],
];
export const RAIL_POINTS: readonly (readonly [number, number])[] = [
  [0, 40],
  [40, 36],
  [80, 20],
  [100, -20],
  [112, -70],
  [120, -112],
];
export const PATH_JERUSALEM_POINTS: readonly (readonly [number, number])[] = [
  [120, -112],
  [128, -120],
  [138, -127],
];

export const ROADS: readonly RoadSpec[] = [
  { points: ROAD_MAIN_POINTS, width: 5, shoulder: 4, color: '#c4aa80' },
  { points: PATH_VILLAGE_POINTS, width: 3, shoulder: 3, color: '#d3bb8c' },
  { points: PATH_STATION_POINTS, width: 3, shoulder: 3, color: '#d3bb8c' },
  { points: RAIL_POINTS, width: 3, shoulder: 3, color: '#6f675d' },
  { points: PATH_JERUSALEM_POINTS, width: 3, shoulder: 2, color: '#d3bb8c' },
  // Wide beaten-earth plazas flatten the ground under each community (no posts along them).
  { points: [[-80, 2], [-56, 4], [-34, 8]], width: 34, shoulder: 12, color: '#c9b88f' },
  { points: [[-62, 24], [-34, 22]], width: 14, shoulder: 8, color: '#c4b186' },
  { points: [[0, 48], [30, 48]], width: 16, shoulder: 8, color: '#c9b88f' },
  { points: [[74, 148], [100, 158]], width: 26, shoulder: 10, color: '#bba980' },
  { points: [[56, 60], [88, 60]], width: 18, shoulder: 8, color: '#c4b186' },
  { points: [[124, -116], [146, -132]], width: 22, shoulder: 10, color: '#c8b996' },
];
export const RAIL_ROAD_INDEX = 3;
/** Roads and paths that get marker posts (the first, second, third and fifth). */
export const POSTED_ROADS: readonly number[] = [0, 1, 2, 4];

/** Terrain blend toward gentle Judean hills in the north-east (Jerusalem). */
export function hillMask(x: number, z: number): number {
  return 0.45 * Math.min(1, Math.max(0, (x - z - 140) / 140));
}

// ---- sown fields (stepping in one is the "field crossing" failure) -----------------------------------

export interface FieldRect {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export const FIELDS: readonly FieldRect[] = [
  { id: 'f1', minX: 0, maxX: 34, minZ: 56, maxZ: 76 },
  { id: 'f2', minX: 34, maxX: 70, minZ: 88, maxZ: 100 },
  { id: 'f3', minX: 42, maxX: 70, minZ: 104, maxZ: 118 },
  { id: 'f4', minX: 98, maxX: 132, minZ: 120, maxZ: 142 },
  { id: 'f5', minX: -62, maxX: -32, minZ: 52, maxZ: 80 },
];

// ---- Jaffa: port, office, market, cart yard -----------------------------------------------------------

export const SPAWN_PORT = { x: -62, z: 2, heading: Math.PI / 2 };
export const OFFICE = p(-56, -13);
export const HABIB = p(-56, -6.6);
/** The four address tags on the office table (read each one). */
export const TAGS: readonly Pt[] = [p(-61, -3.6), p(-58.4, -3.6), p(-53.6, -3.6), p(-51, -3.6)];
export const PLAN_DESK = p(-45, -3.6);
export const VENDOR = p(-46, 20);
export const LANTERN_CLERK = p(-70, 6);
export const CART_YARD = p(-38, 6);
export const LOAD_PARTS = p(-44, 10);
export const LOAD_PARCEL = p(-41, 13);
export const LOAD_LETTER = p(-48, 8);
export const GATE_YARD = p(-30, 14);
/** Crossing this point with the plan made starts the road (checkpoint road_colony). */
export const GATE_ROAD = p(-25, 28);
export const CART_START = p(-36, 8);

// ---- Rishon LeZion ------------------------------------------------------------------------------------

export const SPAWN_COLONY = { x: 74, z: 146, heading: 0.9 };
export const DEBORA = p(87, 152);
export const WELL = p(92, 157);
export const WELL_SIGN = p(84, 158);
export const LANTERN_COLONY = p(80, 166);

// ---- Arab village -------------------------------------------------------------------------------------

export const VILLAGE_CENTER = p(70, 60);
export const VILLAGE_GATE = p(66, 64);
export const LISTEN_SPOT = p(72, 62);
export const JAMILA = p(77, 55);
export const DECOY_VILLAGE = p(77, 68);
export const OVEN_WOMAN = p(75, 47);
export const LANTERN_VILLAGE = p(66, 52);
export const SPAWN_VILLAGE_ARRIVAL = { x: 58, z: 69, heading: 0.9 };
export const SPAWN_VILLAGE_DONE = { x: 74, z: 58, heading: -2 };

// ---- Jaffa station ------------------------------------------------------------------------------------

export const STATION_ZONE = p(18, 46);
export const SPAWN_STATION = { x: 20, z: 46.5, heading: -1.5 };
export const TICKET_WINDOW = p(8, 45.6);
export const STATIONMASTER = p(14, 45.6);
export const TRAIN_DOOR = p(20.5, 43.2);
export const PLATFORM = { cx: 12, cz: 42.8, length: 22, depth: 3.2 };

// ---- Jerusalem ----------------------------------------------------------------------------------------

export const SPAWN_JERUSALEM = { x: 122, z: -113, heading: 2.2 };
export const ELIYAHU = p(138.5, -132.5);
export const DECOY_JERUSALEM = p(147, -130);
export const LANTERN_JERUSALEM = p(131, -123);

// ---- cargo (units on the cart capacity bar) ------------------------------------------------------------

export const CART_CAPACITY = 8;
export const WEIGHT_PARTS = 5;
export const WEIGHT_PARCEL = 2;
export const WEIGHT_LETTER = 1;

// ---- waypoints (the guide marker and the QA bot follow these) -----------------------------------------

export const WAY_TO_COLONY: readonly Pt[] = [p(-24, 30), p(-20, 56), p(-8, 82), p(10, 98), p(32, 120), p(54, 138), p(74, 147)];
export const WAY_TO_VILLAGE: readonly Pt[] = [p(54, 138), p(32, 120), p(10, 98), p(28, 86), p(46, 76), p(60, 67)];
export const WAY_TO_STATION: readonly Pt[] = [p(56, 54), p(38, 48), p(22, 46)];

// ---- ambience regions -----------------------------------------------------------------------------------

export type Bed = 'sea' | 'village' | 'city';

export function bedAt(x: number, z: number): Bed {
  if (x < -22) return 'sea';
  if (x > 95 && z < -60) return 'city';
  return 'village';
}

// ---- dialogue pacing -------------------------------------------------------------------------------------

/** Reading time for a subtitle, from its length. */
export function readMs(text: string, cap = 14000): number {
  return Math.min(cap, Math.max(2600, 1500 + text.length * 60));
}

export const LISTEN_SECONDS = 20;
export const BELL_SECONDS = 45;

// ---- extra (assist) checkpoints: a point halfway along each long walk ---------------------------------

export const ROAD_MID = p(-8, 82);
export const PATH_MID = p(28, 86);
export const MID_RADIUS = 6;
export const SPAWN_ROAD_MID = { x: -9, z: 80, heading: 0.5 };
export const SPAWN_PATH_MID = { x: 26, z: 87.5, heading: 0.6 };

// ---- everything the scenery must keep clear of trees and props -----------------------------------------

export const KEY_POINTS: readonly Pt[] = [
  HABIB,
  PLAN_DESK,
  VENDOR,
  LANTERN_CLERK,
  CART_YARD,
  LOAD_PARTS,
  LOAD_PARCEL,
  LOAD_LETTER,
  GATE_YARD,
  GATE_ROAD,
  DEBORA,
  WELL_SIGN,
  LANTERN_COLONY,
  VILLAGE_CENTER,
  LISTEN_SPOT,
  JAMILA,
  DECOY_VILLAGE,
  OVEN_WOMAN,
  LANTERN_VILLAGE,
  STATION_ZONE,
  TICKET_WINDOW,
  STATIONMASTER,
  TRAIN_DOOR,
  ELIYAHU,
  DECOY_JERUSALEM,
  LANTERN_JERUSALEM,
  ...TAGS,
];
