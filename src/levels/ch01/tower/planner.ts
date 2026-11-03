import type { Cell } from '../../../gameplay/modules/puzzle';
import { fittingRotations, GRID_H, GRID_W, PIECE_TYPES, RING, type PieceType, type TowerSim } from './rules';

export interface PlaceOutcome {
  readonly ok: boolean;
  /** Locale key of the reason when not ok. */
  readonly reasonKey: string | null;
}

/**
 * Planning-table state: a cursor on the wall grid, the selected frame type and its rotation.
 * The ghost always tries to sit in a rotation that fits, so a player never has to hunt for the
 * right quarter turn on a side wall (manual rotation still cycles through the fitting ones).
 * Pure logic over a TowerSim; the level draws it.
 */
export class Planner {
  cx = 1;
  cy = 1;
  type: PieceType = 'corner';
  rot = 0;
  /** Bumped on every change so the level knows when to redraw. */
  version = 0;
  private cells: Cell[] = [];

  constructor(private readonly sim: TowerSim) {
    this.reset();
  }

  /** Back to the start of a planning session. */
  reset(): void {
    this.cx = 1;
    this.cy = 1;
    this.type = this.firstStocked() ?? 'corner';
    this.rot = 0;
    this.orient();
  }

  private firstStocked(): PieceType | null {
    return PIECE_TYPES.find((t) => this.sim.unplaced(t).length > 0) ?? null;
  }

  get pieceId(): string | null {
    return this.sim.unplaced(this.type)[0] ?? null;
  }

  /** Cells the selected frame would cover at the cursor (empty when none is left). */
  get ghost(): readonly Cell[] {
    return this.cells;
  }

  get fits(): boolean {
    const id = this.pieceId;
    return id !== null && this.sim.puzzle.check(id, { x: this.cx, y: this.cy, rot: this.rot }) === null;
  }

  /** Remaining unplaced frames of a type. */
  remaining(type: PieceType): number {
    return this.sim.unplaced(type).length;
  }

  move(dx: number, dy: number): void {
    const nx = Math.min(GRID_W - 1, Math.max(0, this.cx + dx));
    const ny = Math.min(GRID_H - 1, Math.max(0, this.cy + dy));
    if (nx === this.cx && ny === this.cy) return;
    this.cx = nx;
    this.cy = ny;
    this.orient();
  }

  /** Puts the cursor on a ring cell (used by tests and the bot). */
  moveTo(cx: number, cy: number): void {
    this.cx = Math.min(GRID_W - 1, Math.max(0, cx));
    this.cy = Math.min(GRID_H - 1, Math.max(0, cy));
    this.orient();
  }

  /** Next (dir 1) or previous (dir -1) frame type that still has frames left. */
  cycleType(dir: 1 | -1): void {
    const n = PIECE_TYPES.length;
    const start = PIECE_TYPES.indexOf(this.type);
    for (let i = 1; i <= n; i++) {
      const t = PIECE_TYPES[(start + dir * i + n * 4) % n] as PieceType;
      if (this.sim.unplaced(t).length > 0) {
        this.type = t;
        this.orient();
        return;
      }
    }
  }

  /** Next quarter turn that fits; a plain +1 when nothing fits. */
  rotate(): void {
    const id = this.pieceId;
    if (id === null) return;
    const fitting = fittingRotations(this.sim.puzzle, id, this.cx, this.cy);
    const next = fitting.find((r) => r > this.rot) ?? fitting[0];
    this.rot = next ?? (this.rot + 1) % 4;
    this.refresh();
  }

  place(): PlaceOutcome {
    const id = this.pieceId;
    if (id === null) return { ok: false, reasonKey: 'levels.ch01.tower.plan.none' };
    const reason = this.sim.placeFrame(id, { x: this.cx, y: this.cy, rot: this.rot });
    if (reason !== null) return { ok: false, reasonKey: reason };
    if (this.sim.unplaced(this.type).length === 0) this.cycleType(1);
    this.orient();
    return { ok: true, reasonKey: null };
  }

  /** Lifts the frame covering the cursor cell back onto the pile. */
  pickUp(): boolean {
    const id = this.sim.frameAt(this.cx, this.cy);
    if (id === null || !this.sim.removeFrame(id)) return false;
    this.type = id.split('-')[0] as PieceType;
    this.orient();
    return true;
  }

  /** Lifts every placed frame. */
  clear(): void {
    this.sim.puzzle.reset();
    this.type = this.firstStocked() ?? 'corner';
    this.orient();
  }

  /** Placed frames the player may lift (HUD count). */
  get placedCount(): number {
    return this.sim.puzzle.placedCount;
  }

  /** Cursor cell on a wall ring cell (a hint for the ghost color). */
  get onRing(): boolean {
    return RING.some((c) => c.cx === this.cx && c.cy === this.cy);
  }

  /** Keeps the current rotation when it fits, else the first one that does. */
  private orient(): void {
    const id = this.pieceId;
    if (id !== null) {
      const fitting = fittingRotations(this.sim.puzzle, id, this.cx, this.cy);
      if (fitting.length > 0 && !fitting.includes(this.rot)) this.rot = fitting[0] as number;
    }
    this.refresh();
  }

  private refresh(): void {
    const id = this.pieceId;
    this.cells = id === null ? [] : this.sim.puzzle.cellsOf(id, { x: this.cx, y: this.cy, rot: this.rot });
    this.version += 1;
  }
}
