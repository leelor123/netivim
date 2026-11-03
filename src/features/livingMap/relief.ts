import { CONTROL_POINTS, type ControlPoint } from './controlPoints';

/** Pure, deterministic relief generator (no three.js): the same inputs always give the same grid. */

export const REGION = { latMin: 29.45, latMax: 33.5, lonMin: 33.8, lonMax: 36.2 } as const;
/** Scene units: one unit is this many kilometres. */
export const KM_PER_UNIT = 10;
/** Vertical exaggeration of the stylized relief (shown to the player in the UI). */
export const RELIEF_EXAGGERATION = 14;

const LAT0 = (REGION.latMin + REGION.latMax) / 2;
const LON0 = (REGION.lonMin + REGION.lonMax) / 2;
const KM_PER_DEG_LAT = 110.57;
const KM_PER_DEG_LON = 111.32 * Math.cos((LAT0 * Math.PI) / 180);

export interface XZ {
  x: number;
  z: number;
}

/** Equirectangular projection around the region centre; north is -z, east is +x. */
export function project(lat: number, lon: number, out: XZ = { x: 0, z: 0 }): XZ {
  out.x = ((lon - LON0) * KM_PER_DEG_LON) / KM_PER_UNIT;
  out.z = (-(lat - LAT0) * KM_PER_DEG_LAT) / KM_PER_UNIT;
  return out;
}

export function unproject(x: number, z: number): { lat: number; lon: number } {
  return { lat: LAT0 - (z * KM_PER_UNIT) / KM_PER_DEG_LAT, lon: LON0 + (x * KM_PER_UNIT) / KM_PER_DEG_LON };
}

export function worldHeight(elevM: number): number {
  return ((elevM / 1000) / KM_PER_UNIT) * RELIEF_EXAGGERATION;
}

export const REGION_SIZE = {
  width: (REGION.lonMax - REGION.lonMin) * KM_PER_DEG_LON / KM_PER_UNIT,
  depth: (REGION.latMax - REGION.latMin) * KM_PER_DEG_LAT / KM_PER_UNIT,
};

// ---- coast -----------------------------------------------------------------------------------

/** Mediterranean coast points, south to north (the Gulf of Aqaba shore is handled separately). */
const MED_COAST: readonly ControlPoint[] = CONTROL_POINTS.filter((p) => p.kind === 'coast' && p.lat > 31).sort((a, b) => a.lat - b.lat);
const SOUTH_COAST = MED_COAST[0] as ControlPoint;
const NORTH_COAST = MED_COAST[MED_COAST.length - 1] as ControlPoint;

/** Longitude of the Mediterranean shore at a latitude, or null where there is no such coast. */
export function coastLonAt(lat: number): number | null {
  if (lat < SOUTH_COAST.lat) return null;
  if (lat >= NORTH_COAST.lat) return NORTH_COAST.lon;
  for (let i = 0; i < MED_COAST.length - 1; i++) {
    const a = MED_COAST[i] as ControlPoint;
    const b = MED_COAST[i + 1] as ControlPoint;
    if (lat >= a.lat && lat <= b.lat) {
      const t = (lat - a.lat) / (b.lat - a.lat);
      return a.lon + (b.lon - a.lon) * t;
    }
  }
  return null;
}

export type Surface = 'land' | 'sea' | 'lake';

interface Lake {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly rLat: number;
  readonly rLon: number;
  readonly levelM: number;
}

/** Simplified lake outlines (ellipses) at documented surface levels. */
const LAKES: readonly Lake[] = [
  { id: 'dead-sea', lat: 31.43, lon: 35.47, rLat: 0.34, rLon: 0.075, levelM: -430 },
  { id: 'sea-of-galilee', lat: 32.82, lon: 35.59, rLat: 0.085, rLon: 0.06, levelM: -209 },
];

function lakeAt(lat: number, lon: number): Lake | null {
  for (const l of LAKES) {
    const a = (lat - l.lat) / l.rLat;
    const b = (lon - l.lon) / l.rLon;
    if (a * a + b * b <= 1) return l;
  }
  return null;
}

export function surfaceAt(lat: number, lon: number): Surface {
  const coast = coastLonAt(lat);
  if (coast !== null && lon < coast) return 'sea';
  if (lat < 29.55 && lon > 34.88) return 'sea';
  return lakeAt(lat, lon) ? 'lake' : 'land';
}

// ---- noise -----------------------------------------------------------------------------------

/** Integer hash -> 0..1 (deterministic, no Math.random). */
function hash2(ix: number, iy: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export const RELIEF_SEED = 1948;
const NOISE_AMPLITUDE_M = 45;
/** Noise fades to zero this close (degrees) to any control point, so the points stay exact. */
const NOISE_FADE_DEG = 0.12;
const IDW_POWER = 2.4;

const INTERP_POINTS: readonly ControlPoint[] = CONTROL_POINTS;

/**
 * Terrain elevation in metres. Land is a Shepard (inverse distance) interpolation of the control
 * points (exact at each point) plus small seeded noise that fades to zero at the points. The sea
 * floor falls away from the coast; lakes sit flat at their documented level.
 */
export function elevationAt(lat: number, lon: number): number {
  const surface = surfaceAt(lat, lon);
  if (surface === 'sea') {
    const coast = coastLonAt(lat);
    const dist = coast === null ? Math.max(0, lon - 34.88) : coast - lon;
    return -Math.min(600, dist * 320);
  }
  if (surface === 'lake') return (lakeAt(lat, lon) as Lake).levelM;

  let num = 0;
  let den = 0;
  let nearest = Infinity;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  for (const p of INTERP_POINTS) {
    const dy = lat - p.lat;
    const dx = (lon - p.lon) * cosLat;
    const d2 = dx * dx + dy * dy;
    if (d2 < 1e-12) return p.elevM;
    const d = Math.sqrt(d2);
    if (d < nearest) nearest = d;
    const w = 1 / Math.pow(d, IDW_POWER);
    num += w * p.elevM;
    den += w;
  }
  const base = num / den;
  const fade = Math.min(1, nearest / NOISE_FADE_DEG);
  const smooth = fade * fade * (3 - 2 * fade);
  const n = valueNoise(lon * 22, lat * 22, RELIEF_SEED) - 0.5;
  return base + n * 2 * NOISE_AMPLITUDE_M * smooth;
}

// ---- grid ------------------------------------------------------------------------------------

export interface ReliefGrid {
  readonly cols: number;
  readonly rows: number;
  /** Row-major, row 0 is the northern edge. Metres. */
  readonly heights: Float32Array;
  /** 0 land, 1 sea, 2 lake. */
  readonly surfaces: Uint8Array;
}

export const DEFAULT_GRID = { cols: 96, rows: 112 } as const;

export function buildReliefGrid(cols: number = DEFAULT_GRID.cols, rows: number = DEFAULT_GRID.rows): ReliefGrid {
  const heights = new Float32Array(cols * rows);
  const surfaces = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const lat = REGION.latMax - ((REGION.latMax - REGION.latMin) * r) / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const lon = REGION.lonMin + ((REGION.lonMax - REGION.lonMin) * c) / (cols - 1);
      const i = r * cols + c;
      heights[i] = elevationAt(lat, lon);
      const s = surfaceAt(lat, lon);
      surfaces[i] = s === 'land' ? 0 : s === 'sea' ? 1 : 2;
    }
  }
  return { cols, rows, heights, surfaces };
}

/** Terrain colour (linear-ish sRGB triplet 0..1) for a height and surface; shared by the mesh and tests. */
export function terrainColor(elevM: number, surface: 0 | 1 | 2, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  if (surface === 1) {
    const t = Math.min(1, -elevM / 600);
    out[0] = 0.14 - 0.08 * t;
    out[1] = 0.36 - 0.18 * t;
    out[2] = 0.52 - 0.2 * t;
  } else if (surface === 2) {
    out[0] = 0.2;
    out[1] = 0.5;
    out[2] = 0.62;
  } else if (elevM < 0) {
    out[0] = 0.62;
    out[1] = 0.55;
    out[2] = 0.38;
  } else if (elevM < 250) {
    const t = elevM / 250;
    out[0] = 0.74 - 0.12 * t;
    out[1] = 0.68 + 0.02 * t;
    out[2] = 0.44;
  } else if (elevM < 900) {
    const t = (elevM - 250) / 650;
    out[0] = 0.62 - 0.12 * t;
    out[1] = 0.7 - 0.22 * t;
    out[2] = 0.44 - 0.06 * t;
  } else {
    const t = Math.min(1, (elevM - 900) / 1900);
    out[0] = 0.5 + 0.42 * t;
    out[1] = 0.48 + 0.44 * t;
    out[2] = 0.38 + 0.5 * t;
  }
  return out;
}
