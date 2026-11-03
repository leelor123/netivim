/**
 * Grid placement / assembly puzzles (PZL), e.g. raising a tower-and-stockade settlement:
 * pieces made of cells snap onto a grid, can rotate, may not overlap or leave the board.
 */

export type Cell = readonly [number, number];

export interface PuzzlePiece {
  readonly id: string;
  readonly labelKey: string;
  /** Cells relative to the piece origin, rotation 0. */
  readonly cells: readonly Cell[];
}

export interface PuzzleDef {
  readonly width: number;
  readonly height: number;
  readonly pieces: readonly PuzzlePiece[];
  /** Cells that may not be built on (rocks, a wadi). */
  readonly blocked?: readonly Cell[];
  /** Optional target: piece id -> required origin and rotation (otherwise any full placement wins). */
  readonly target?: Readonly<Record<string, { readonly x: number; readonly y: number; readonly rot: number }>>;
}

export interface Placement {
  readonly x: number;
  readonly y: number;
  /** Quarter turns 0-3. */
  readonly rot: number;
}

/** Rotates a cell by quarter turns around the origin. */
export function rotateCell(c: Cell, rot: number): Cell {
  const r = ((rot % 4) + 4) % 4;
  const [x, y] = c;
  if (r === 0) return [x, y];
  if (r === 1) return [-y, x];
  if (r === 2) return [-x, -y];
  return [y, -x];
}

/** World position to the nearest grid cell (snapping). */
export function snapToCell(wx: number, wz: number, originX: number, originZ: number, cellSize: number): Cell {
  return [Math.round((wx - originX) / cellSize), Math.round((wz - originZ) / cellSize)];
}

export class GridPuzzle {
  private readonly placed = new Map<string, Placement>();

  constructor(readonly def: PuzzleDef) {}

  placementOf(id: string): Placement | undefined {
    return this.placed.get(id);
  }

  cellsOf(id: string, p: Placement): Cell[] {
    const piece = this.def.pieces.find((q) => q.id === id);
    if (!piece) throw new Error('Unknown piece ' + id);
    return piece.cells.map((c) => {
      const [x, y] = rotateCell(c, p.rot);
      return [x + p.x, y + p.y] as const;
    });
  }

  /** Why a placement is not allowed (locale key), or null when it fits. */
  check(id: string, p: Placement): string | null {
    const occupied = new Set<string>();
    for (const [pid, pl] of this.placed) {
      if (pid === id) continue;
      for (const [x, y] of this.cellsOf(pid, pl)) occupied.add(x + ',' + y);
    }
    const blocked = new Set((this.def.blocked ?? []).map(([x, y]) => x + ',' + y));
    for (const [x, y] of this.cellsOf(id, p)) {
      if (x < 0 || y < 0 || x >= this.def.width || y >= this.def.height) return 'gameplay.puzzle.outside';
      const k = x + ',' + y;
      if (blocked.has(k)) return 'gameplay.puzzle.blocked';
      if (occupied.has(k)) return 'gameplay.puzzle.overlap';
    }
    return null;
  }

  place(id: string, p: Placement): boolean {
    if (this.check(id, p) !== null) return false;
    this.placed.set(id, { x: p.x, y: p.y, rot: ((p.rot % 4) + 4) % 4 });
    return true;
  }

  remove(id: string): void {
    this.placed.delete(id);
  }

  reset(): void {
    this.placed.clear();
  }

  get placedCount(): number {
    return this.placed.size;
  }

  get solved(): boolean {
    if (this.placed.size !== this.def.pieces.length) return false;
    const target = this.def.target;
    if (!target) return true;
    for (const [id, want] of Object.entries(target)) {
      const p = this.placed.get(id);
      if (!p || p.x !== want.x || p.y !== want.y || p.rot !== ((want.rot % 4) + 4) % 4) return false;
    }
    return true;
  }
}
