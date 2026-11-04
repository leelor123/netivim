import { GridPuzzle, type Cell, type Placement, type PuzzleDef, type PuzzlePiece } from '../../../gameplay/modules/puzzle';

/**
 * Rules and layout of "Tower and Stockade (1937)" without any rendering: the day clock, the
 * ring of wall cells, the prefabricated frame pieces, the gravel stations, the tower and fence
 * steps, and the TowerSim that enforces them. Pure, so it runs in unit tests and under the QA bot.
 *
 * Source status (missions.md): prefabricated wood, a double wall filled with gravel, a tower and
 * "within a day" are DOCUMENTED (C1-065); the layout, the order of stages, the fence and the
 * searchlight are RECONSTRUCTED game elements.
 */

// ---- layout -------------------------------------------------------------------------------

/** Wall grid: 12 x 9 cells of 2 m; the ring of cells is the stockade wall. */
export const CELL = 2;
export const GRID_W = 12;
export const GRID_H = 9;
/** World position of cell (0, 0) center. */
export const ORIGIN_X = -11;
export const ORIGIN_Z = -12;
/** Gate: two cells in the middle of the south side. */
export const GATE_CELLS: readonly Cell[] = [
  [5, 8],
  [6, 8],
];

export const cellX = (cx: number): number => ORIGIN_X + cx * CELL;
export const cellZ = (cy: number): number => ORIGIN_Z + cy * CELL;

export type RingKind = 'corner' | 'h' | 'v';

export interface RingCell {
  readonly cx: number;
  readonly cy: number;
  readonly x: number;
  readonly z: number;
  readonly kind: RingKind;
  /** Corner index 0 TL, 1 TR, 2 BR, 3 BL (corners only). */
  readonly corner: number;
}

const isGate = (cx: number, cy: number): boolean => GATE_CELLS.some(([gx, gy]) => gx === cx && gy === cy);

function ringKey(cx: number, cy: number): string {
  return cx + ',' + cy;
}

function buildRing(): RingCell[] {
  const order: Cell[] = [];
  for (let x = 0; x < GRID_W; x++) order.push([x, 0]);
  for (let y = 1; y < GRID_H; y++) order.push([GRID_W - 1, y]);
  for (let x = GRID_W - 2; x >= 0; x--) order.push([x, GRID_H - 1]);
  for (let y = GRID_H - 2; y >= 1; y--) order.push([0, y]);
  const out: RingCell[] = [];
  for (const [cx, cy] of order) {
    if (isGate(cx, cy)) continue;
    const left = cx === 0;
    const right = cx === GRID_W - 1;
    const top = cy === 0;
    const bottom = cy === GRID_H - 1;
    const corner = (left || right) && (top || bottom);
    const idx = corner ? (top ? (left ? 0 : 1) : left ? 3 : 2) : -1;
    out.push({ cx, cy, x: cellX(cx), z: cellZ(cy), kind: corner ? 'corner' : top || bottom ? 'h' : 'v', corner: idx });
  }
  return out;
}

/** Wall cells in clockwise order from the top-left corner, the gate cells left out. */
export const RING: readonly RingCell[] = buildRing();
const RING_KEYS = new Set(RING.map((c) => ringKey(c.cx, c.cy)));
export const isRingCell = (cx: number, cy: number): boolean => RING_KEYS.has(ringKey(cx, cy));

/** Compound center (the planning camera looks here). */
export const CENTER_X = 0;
export const CENTER_Z = cellZ((GRID_H - 1) / 2);

// ---- pieces -------------------------------------------------------------------------------

export type PieceType = 'corner' | 'l4' | 'l3' | 'l2' | 'l1';
export const PIECE_TYPES: readonly PieceType[] = ['corner', 'l4', 'l3', 'l2', 'l1'];

const line = (n: number): Cell[] => Array.from({ length: n }, (_, i) => [i, 0] as const);

const TYPE_CELLS: Readonly<Record<PieceType, readonly Cell[]>> = {
  corner: [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  l4: line(4),
  l3: line(3),
  l2: line(2),
  l1: line(1),
};

export const PIECE_COUNTS: Readonly<Record<PieceType, number>> = { corner: 4, l4: 2, l3: 2, l2: 4, l1: 2 };

export interface PieceInfo extends PuzzlePiece {
  readonly type: PieceType;
}

function buildPieces(): PieceInfo[] {
  const out: PieceInfo[] = [];
  for (const type of PIECE_TYPES) {
    for (let i = 0; i < PIECE_COUNTS[type]; i++) out.push({ id: type + '-' + String(i), type, labelKey: 'levels.ch01.tower.piece.' + type, cells: TYPE_CELLS[type] });
  }
  return out;
}

export const PIECES: readonly PieceInfo[] = buildPieces();
export const pieceType = (id: string): PieceType => (id.split('-')[0] as PieceType);

/** Frames on each cart (cart index -> piece ids). */
export const CART_PIECES: readonly (readonly string[])[] = [
  ['corner-0', 'corner-1', 'corner-2', 'corner-3'],
  ['l4-0', 'l4-1', 'l3-0', 'l3-1'],
  ['l2-0', 'l2-1', 'l2-2', 'l2-3'],
  ['l1-0', 'l1-1'],
];
export const CART_COUNT = CART_PIECES.length;

function buildPuzzleDef(): PuzzleDef {
  const blocked: Cell[] = [];
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) if (!isRingCell(x, y)) blocked.push([x, y]);
  return { width: GRID_W, height: GRID_H, pieces: PIECES, blocked };
}

export const PUZZLE_DEF: PuzzleDef = buildPuzzleDef();

/** One valid full placement (used by the QA bot and by tests). */
export const SOLUTION: Readonly<Record<string, Placement>> = {
  'corner-0': { x: 0, y: 0, rot: 0 },
  'corner-1': { x: GRID_W - 1, y: 0, rot: 1 },
  'corner-2': { x: GRID_W - 1, y: GRID_H - 1, rot: 2 },
  'corner-3': { x: 0, y: GRID_H - 1, rot: 3 },
  'l4-0': { x: 2, y: 0, rot: 0 },
  'l4-1': { x: 6, y: 0, rot: 0 },
  'l3-0': { x: 0, y: 2, rot: 1 },
  'l3-1': { x: GRID_W - 1, y: 2, rot: 1 },
  'l2-0': { x: 0, y: 5, rot: 1 },
  'l2-1': { x: GRID_W - 1, y: 5, rot: 1 },
  'l2-2': { x: 2, y: GRID_H - 1, rot: 0 },
  'l2-3': { x: 8, y: GRID_H - 1, rot: 0 },
  'l1-0': { x: 4, y: GRID_H - 1, rot: 0 },
  'l1-1': { x: 7, y: GRID_H - 1, rot: 0 },
};

/** Rotations (0-3) at which a piece fits at a cell, given the current board. */
export function fittingRotations(puzzle: GridPuzzle, id: string, x: number, y: number): number[] {
  const out: number[] = [];
  for (let rot = 0; rot < 4; rot++) if (puzzle.check(id, { x, y, rot }) === null) out.push(rot);
  return out;
}

// ---- gravel, tower, fence -----------------------------------------------------------------

export const STATION_COUNT = 6;
export const LOADS_PER_TRIP = 2;
export const SECTION_COUNT = 3;
export const FENCE_LEGS = 4;

export interface Spot {
  readonly x: number;
  readonly z: number;
}

/** Ring cells served by each gravel station (consecutive, clockwise). */
export const STATION_CELLS: readonly (readonly RingCell[])[] = Array.from({ length: STATION_COUNT }, (_, k) => {
  const per = RING.length / STATION_COUNT;
  return RING.slice(k * per, (k + 1) * per);
});

function stationSpot(cells: readonly RingCell[]): Spot {
  let sx = 0;
  let sz = 0;
  for (const c of cells) {
    sx += c.x;
    sz += c.z;
  }
  sx /= cells.length;
  sz /= cells.length;
  const dx = CENTER_X - sx;
  const dz = CENTER_Z - sz;
  const d = Math.hypot(dx, dz) || 1;
  return { x: sx + (dx / d) * 2.7, z: sz + (dz / d) * 2.7 };
}

export const STATION_SPOTS: readonly Spot[] = STATION_CELLS.map(stationSpot);

export const SPAWN = { x: 0, z: 17, heading: Math.PI };
export const CART_SPOTS: readonly Spot[] = [
  { x: -9, z: 11.5 },
  { x: -3, z: 11.5 },
  { x: 3, z: 11.5 },
  { x: 9, z: 11.5 },
];
export const TABLE_SPOT: Spot = { x: -14, z: 6 };
export const GATE_OUT: Spot = { x: 0, z: 7.5 };
export const GATE_IN: Spot = { x: 0, z: 1.5 };
export const GRAVEL_PILE: Spot = { x: 5, z: -0.5 };
export const SECTION_PILE: Spot = { x: -5, z: -0.5 };
export const LIGHT_CRATE: Spot = { x: 0, z: -4.5 };
export const TOWER_BASE: Spot = { x: 7, z: -8.4 };
export const JUG_SPOT: Spot = { x: -8, z: 6.2 };
export const MEAL_SPOT: Spot = { x: -9, z: 0.5 };
/** Corner stakes outside the ring corners (the red-rag stakes on the site); the player ties a cord to each. */
export const STAKE_COUNT = 4;
export const STAKE_SPOTS: readonly Spot[] = [
  { x: cellX(0) - 1.4, z: cellZ(0) - 1.4 },
  { x: cellX(GRID_W - 1) + 1.4, z: cellZ(0) - 1.4 },
  { x: cellX(GRID_W - 1) + 1.4, z: cellZ(GRID_H - 1) + 1.4 },
  { x: cellX(0) - 1.4, z: cellZ(GRID_H - 1) + 1.4 },
];
/** Where players and the bot stand to tie a stake's cord (a step toward the compound, clear of the table). */
export const stakeStand = (i: number): Spot => {
  const s = STAKE_SPOTS[i] as Spot;
  return { x: s.x + (s.x < 0 ? 1.6 : -1.6), z: s.z + (s.z < -4 ? 1.6 : -1.6) };
};
/** The board with the day's schedule, near the start. */
export const SIGN_SPOT: Spot = { x: -6.5, z: 16 };
/** A man from the village on the hill, at the field's edge east of the gate (FICTIONAL COMPOSITE). */
export const NEIGHBOR_SPOT: Spot = { x: 20.5, z: 4.5 };
export const NEIGHBOR_STAND: Spot = { x: 18, z: 5.2 };
/** Where the team sits down at dusk. */
export const REST_SPOT: Spot = { x: -2.5, z: -2.5 };
export const TENT_SPOTS: readonly Spot[] = [
  { x: -2.2, z: -8.9 },
  { x: 2.2, z: -8.9 },
];
/** Fence corner posts, clockwise from the south-west; leg k runs from post k to post k+1 (the last one closes at the south-west). */
export const FENCE_POSTS: readonly Spot[] = [
  { x: -16, z: 8 },
  { x: -16, z: -17 },
  { x: 16, z: -17 },
  { x: 16, z: 8 },
];
/** The south leg leaves a gap for the gate. */
export const FENCE_GATE_HALF = 3;
/** Where the player strings leg k: at the far post of that leg. */
export const fenceSpot = (leg: number): Spot => FENCE_POSTS[(leg + 1) % FENCE_POSTS.length] as Spot;

// ---- the day ------------------------------------------------------------------------------

export type Stage = 'dawn' | 'walls' | 'gravel' | 'tower' | 'fence' | 'dusk' | 'lenses';
export const STAGES: readonly Stage[] = ['dawn', 'walls', 'gravel', 'tower', 'fence', 'dusk', 'lenses'];
/**
 * Mission checkpoints cp1..cp5. Their names (content) describe the world on arrival: dawn with
 * the site marked, the walls standing (gravel), the walls filled (tower), the tower standing
 * (fence), the searchlight mounted (dusk). `walls` and `lenses` are extra checkpoints (assist).
 */
export const CHECKPOINT_STAGES: readonly Stage[] = ['dawn', 'gravel', 'tower', 'fence', 'dusk'];
export const EXTRA_CHECKPOINT_STAGES: readonly Stage[] = ['walls', 'lenses'];

/** Base length of the day in seconds (scaled by the difficulty timer). Sunset at fraction 1. */
export const DAY_SECONDS = 600;
/** Nominal day fraction at which each stage begins (a checkpoint restart never starts later). */
export const STAGE_START: Readonly<Record<Stage, number>> = { dawn: 0, walls: 0.12, gravel: 0.25, tower: 0.45, fence: 0.62, dusk: 0.8, lenses: 1 };

/** The last stretch of the day: the sun meter shows from here. */
export const SUN_METER_FROM = 0.75;

/** Failure reasons: locale keys of the one-line reason on the failure card. */
export const FAIL_TIME_OUT = 'levels.ch01.tower.fail.timeout';
export const FAIL_UNFILLED = 'levels.ch01.tower.fail.unfilled';
export const FAIL_ORDER = 'levels.ch01.tower.fail.order';

/** Why the day ends in failure when the sun sets in this stage. */
export function sunsetReason(stage: Stage): string {
  return stage === 'gravel' ? FAIL_UNFILLED : FAIL_TIME_OUT;
}

/** Day fraction a restart at `stage` begins with, given the fraction recorded when it was first reached. */
export function restartFraction(stage: Stage, recorded: number | undefined): number {
  const nominal = STAGE_START[stage];
  return recorded === undefined ? nominal : Math.min(recorded, nominal);
}

/** Crew anchors per stage: worker i walks between [2i] and [2i + 1]. */
export const CREW_COUNT = 6;
export const CREW_ANCHORS: Readonly<Record<Stage, readonly Spot[]>> = (() => {
  const s = STATION_SPOTS;
  const c = CART_SPOTS;
  const at = (x: number, z: number): Spot => ({ x, z });
  const dawn: Spot[] = [c[0] as Spot, at(-7, 8), c[1] as Spot, at(-2, 9), c[2] as Spot, at(2, 9), c[3] as Spot, at(7, 8), at(-12, 9), at(-14, 6), at(12, 9), at(14, 6)];
  const walls: Spot[] = [at(-14, -3), at(-14, -9), at(14, -3), at(14, -9), at(-8, -15), at(8, -15), at(-8, 7), at(-4, 7), at(8, 7), at(4, 7), at(-14, 2), at(-14, -1)];
  const gravel: Spot[] = [GRAVEL_PILE, s[0] as Spot, GRAVEL_PILE, s[2] as Spot, GRAVEL_PILE, s[4] as Spot, at(2.5, -1), s[1] as Spot, at(4, -3), s[3] as Spot, at(3, -4), s[5] as Spot];
  const tower: Spot[] = [SECTION_PILE, TOWER_BASE, at(-3, -2), at(5, -6), at(-1, -3), at(3, -7), at(-9, -1), at(-9, -5), at(8, -2), at(6, -4), at(0, 0), at(-2, -5)];
  const fence: Spot[] = [at(-14, -15), at(-6, -15), at(14, -15), at(14, -6), at(14, 6), at(8, 8), at(-14, 6), at(-8, 8), at(-14, -8), at(-14, -2), at(4, -15), at(10, -15)];
  const dusk: Spot[] = [at(5, -5), at(6, -6), at(4, -4), at(6, -4), at(8, -5), at(9, -4), at(3, -6), at(5, -7), at(7, -4), at(6, -3), at(4, -5), at(5, -3)];
  return { dawn, walls, gravel, tower, fence, dusk, lenses: dusk };
})();

// ---- the simulation -----------------------------------------------------------------------

export type Carry = 'none' | 'gravel' | 'section' | 'light';

export interface SimSnapshot {
  readonly stage: Stage;
  readonly clock: number;
  readonly unloaded: readonly boolean[];
  readonly placed: Readonly<Record<string, Placement>>;
  readonly filled: readonly boolean[];
  readonly loads: number;
  readonly carry: Carry;
  readonly sections: number;
  readonly fence: number;
  readonly lightMounted: boolean;
  readonly lit: boolean;
  readonly warned: boolean;
  readonly water: boolean;
  readonly meal: boolean;
  readonly staked?: readonly boolean[];
  readonly signRead?: boolean;
  readonly neighbor?: boolean;
  readonly rested?: boolean;
}

export type FillResult = 'ok' | 'empty' | 'filled' | 'stage';

/**
 * The state of the work site and the rules that change it. The level calls these methods from
 * interactions and from the planning table; each returns whether it took effect.
 */
export class TowerSim {
  stage: Stage = 'dawn';
  /** Day fraction 0 (dawn) .. 1 (sunset). */
  clock = 0;
  readonly unloaded: boolean[] = Array.from({ length: CART_COUNT }, () => false);
  readonly puzzle = new GridPuzzle(PUZZLE_DEF);
  readonly filled: boolean[] = Array.from({ length: STATION_COUNT }, () => false);
  loads = 0;
  carry: Carry = 'none';
  sections = 0;
  fence = 0;
  lightMounted = false;
  lit = false;
  /** The player was warned about starting the tower on an unfilled wall. */
  warned = false;
  water = false;
  meal = false;
  /** Corner stakes tied at dawn. */
  readonly staked: boolean[] = Array.from({ length: STAKE_COUNT }, () => false);
  signRead = false;
  /** The player went to the man at the field's edge (required before the searchlight). */
  neighbor = false;
  rested = false;

  get allStaked(): boolean {
    return this.staked.every(Boolean);
  }

  get stakedCount(): number {
    return this.staked.filter(Boolean).length;
  }

  stake(i: number): boolean {
    if (this.stage !== 'dawn' || this.staked[i] !== false) return false;
    this.staked[i] = true;
    return true;
  }

  hearNeighbor(): boolean {
    if (this.stage !== 'dusk' || this.neighbor) return false;
    this.neighbor = true;
    return true;
  }

  get allUnloaded(): boolean {
    return this.unloaded.every(Boolean);
  }

  get walled(): boolean {
    return this.puzzle.solved;
  }

  get allFilled(): boolean {
    return this.filled.every(Boolean);
  }

  get filledCount(): number {
    return this.filled.filter(Boolean).length;
  }

  get towerReady(): boolean {
    return this.sections >= SECTION_COUNT;
  }

  /** Piece ids that have been unloaded from carts (the supply). */
  isAvailable(id: string): boolean {
    return CART_PIECES.some((ids, cart) => this.unloaded[cart] === true && ids.includes(id));
  }

  /** Unplaced supply of a type (ids). */
  unplaced(type: PieceType): string[] {
    return PIECES.filter((p) => p.type === type && this.isAvailable(p.id) && !this.puzzle.placementOf(p.id)).map((p) => p.id);
  }

  unload(cart: number): boolean {
    if (this.stage !== 'dawn' || this.unloaded[cart] !== false) return false;
    this.unloaded[cart] = true;
    return true;
  }

  /** Places a frame: null when it worked, otherwise the locale key of the reason. */
  placeFrame(id: string, p: Placement): string | null {
    if (this.stage !== 'walls') return 'levels.ch01.tower.plan.notNow';
    if (!this.isAvailable(id)) return 'levels.ch01.tower.plan.notUnloaded';
    return this.puzzle.check(id, p) ?? (this.puzzle.place(id, p) ? null : 'levels.ch01.tower.plan.notNow');
  }

  removeFrame(id: string): boolean {
    if (this.stage !== 'walls' || !this.puzzle.placementOf(id)) return false;
    this.puzzle.remove(id);
    return true;
  }

  /** Id of the placed frame covering a cell, or null. */
  frameAt(cx: number, cy: number): string | null {
    for (const p of PIECES) {
      const pl = this.puzzle.placementOf(p.id);
      if (pl && this.puzzle.cellsOf(p.id, pl).some(([x, y]) => x === cx && y === cy)) return p.id;
    }
    return null;
  }

  takeGravel(): boolean {
    if (this.stage !== 'gravel' || this.carry === 'section' || this.carry === 'light' || this.loads >= LOADS_PER_TRIP) return false;
    this.loads = LOADS_PER_TRIP;
    this.carry = 'gravel';
    return true;
  }

  fillStation(i: number): FillResult {
    if (this.stage !== 'gravel') return 'stage';
    if (this.loads <= 0) return 'empty';
    if (this.filled[i] !== false) return 'filled';
    this.filled[i] = true;
    this.loads -= 1;
    if (this.loads === 0) this.carry = 'none';
    return 'ok';
  }

  takeSection(): boolean {
    if (this.stage !== 'tower' || this.carry !== 'none' || this.sections >= SECTION_COUNT) return false;
    this.carry = 'section';
    return true;
  }

  placeSection(): boolean {
    if (this.stage !== 'tower' || this.carry !== 'section') return false;
    this.carry = 'none';
    this.sections += 1;
    return true;
  }

  stringFence(leg: number): boolean {
    if (this.stage !== 'fence' || leg !== this.fence) return false;
    this.fence += 1;
    return true;
  }

  takeLight(): boolean {
    if (this.stage !== 'fence' || this.carry !== 'none' || this.lightMounted || !this.towerReady) return false;
    this.carry = 'light';
    return true;
  }

  mountLight(): boolean {
    if (this.stage !== 'fence' || this.carry !== 'light') return false;
    this.carry = 'none';
    this.lightMounted = true;
    return true;
  }

  get fenceDone(): boolean {
    return this.fence >= FENCE_LEGS;
  }

  switchOn(): boolean {
    if (this.stage !== 'dusk' || !this.lightMounted || !this.neighbor || this.lit) return false;
    this.lit = true;
    return true;
  }

  /** Canonical world at the start of a stage (checkpoint restart). */
  resetTo(stage: Stage, clock: number): void {
    this.stage = stage;
    this.clock = clock;
    const idx = STAGES.indexOf(stage);
    for (let i = 0; i < CART_COUNT; i++) this.unloaded[i] = idx > STAGES.indexOf('dawn');
    this.puzzle.reset();
    if (idx > STAGES.indexOf('walls')) for (const [id, p] of Object.entries(SOLUTION)) this.puzzle.place(id, p);
    for (let i = 0; i < STATION_COUNT; i++) this.filled[i] = idx > STAGES.indexOf('gravel');
    this.loads = 0;
    this.carry = 'none';
    this.sections = idx > STAGES.indexOf('tower') ? SECTION_COUNT : 0;
    this.fence = idx > STAGES.indexOf('fence') ? FENCE_LEGS : 0;
    this.lightMounted = idx > STAGES.indexOf('fence');
    this.lit = stage === 'lenses';
    this.warned = false;
    this.water = false;
    this.meal = false;
    for (let i = 0; i < STAKE_COUNT; i++) this.staked[i] = idx > STAGES.indexOf('dawn');
    this.signRead = false;
    this.neighbor = idx > STAGES.indexOf('dusk');
    this.rested = false;
  }

  snapshot(): SimSnapshot {
    const placed: Record<string, Placement> = {};
    for (const p of PIECES) {
      const pl = this.puzzle.placementOf(p.id);
      if (pl) placed[p.id] = { x: pl.x, y: pl.y, rot: pl.rot };
    }
    return {
      stage: this.stage,
      clock: this.clock,
      unloaded: [...this.unloaded],
      placed,
      filled: [...this.filled],
      loads: this.loads,
      carry: this.carry,
      sections: this.sections,
      fence: this.fence,
      lightMounted: this.lightMounted,
      lit: this.lit,
      warned: this.warned,
      water: this.water,
      meal: this.meal,
      staked: [...this.staked],
      signRead: this.signRead,
      neighbor: this.neighbor,
      rested: this.rested,
    };
  }

  restore(s: SimSnapshot): void {
    this.stage = s.stage;
    this.clock = s.clock;
    for (let i = 0; i < CART_COUNT; i++) this.unloaded[i] = s.unloaded[i] === true;
    this.puzzle.reset();
    for (const [id, p] of Object.entries(s.placed)) this.puzzle.place(id, p);
    for (let i = 0; i < STATION_COUNT; i++) this.filled[i] = s.filled[i] === true;
    this.loads = s.loads;
    this.carry = s.carry;
    this.sections = s.sections;
    this.fence = s.fence;
    this.lightMounted = s.lightMounted;
    this.lit = s.lit;
    this.warned = s.warned;
    this.water = s.water;
    this.meal = s.meal;
    for (let i = 0; i < STAKE_COUNT; i++) this.staked[i] = s.staked?.[i] === true;
    this.signRead = s.signRead === true;
    this.neighbor = s.neighbor === true;
    this.rested = s.rested === true;
  }
}

/** Defensive parse of a manual-save payload; null when it is not a snapshot. */
export function parseSnapshot(data: unknown): SimSnapshot | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Partial<SimSnapshot> & { sim?: unknown };
  const s = (d.sim ?? null) as Partial<SimSnapshot> | null;
  if (!s || typeof s !== 'object') return null;
  if (!STAGES.includes(s.stage as Stage) || typeof s.clock !== 'number' || !Array.isArray(s.unloaded) || !Array.isArray(s.filled) || typeof s.placed !== 'object' || s.placed === null) return null;
  return s as SimSnapshot;
}
