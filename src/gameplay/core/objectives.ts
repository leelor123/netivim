/** Objective tracking: which objective is current for a mission state, and its step progress. */

export interface ObjectiveDef {
  readonly id: string;
  /** Locale key of the objective sentence (always shown: DESIGN 3 "objective always shown"). */
  readonly textKey: string;
  /** Mission states during which this objective is the current one. */
  readonly states: readonly string[];
  /** Number of steps (e.g. "3 of 5 crates"); omit for a single-step objective. */
  readonly steps?: number;
}

export interface ObjectiveView {
  readonly id: string;
  readonly textKey: string;
  readonly done: number;
  readonly total: number;
}

export class ObjectiveTracker {
  private currentId: string | null = null;
  private readonly progressById = new Map<string, number>();
  private readonly listeners = new Set<(view: ObjectiveView | null) => void>();

  constructor(
    readonly defs: readonly ObjectiveDef[],
    private readonly onChanged: (objectiveId: string) => void = () => undefined,
  ) {}

  /** Objective for a mission state (first match), or null. */
  forState(state: string): ObjectiveDef | null {
    return this.defs.find((d) => d.states.includes(state)) ?? null;
  }

  get current(): ObjectiveView | null {
    const def = this.defs.find((d) => d.id === this.currentId);
    if (!def) return null;
    return { id: def.id, textKey: def.textKey, done: this.progressById.get(def.id) ?? 0, total: def.steps ?? 1 };
  }

  /** Called on every mission state change. */
  syncState(state: string): void {
    const next = this.forState(state)?.id ?? null;
    if (next === this.currentId) return;
    this.currentId = next;
    if (next) this.onChanged(next);
    this.notify();
  }

  /** Sets step progress (clamped). Returns the clamped value. */
  progress(id: string, done: number): number {
    const def = this.defs.find((d) => d.id === id);
    if (!def) throw new Error('Unknown objective ' + id);
    const v = Math.max(0, Math.min(def.steps ?? 1, Math.floor(done)));
    if (this.progressById.get(id) === v) return v;
    this.progressById.set(id, v);
    if (id === this.currentId) this.notify();
    return v;
  }

  isDone(id: string): boolean {
    const def = this.defs.find((d) => d.id === id);
    return !!def && (this.progressById.get(id) ?? 0) >= (def.steps ?? 1);
  }

  /** Checkpoint restore: progress restarts from a known value set. */
  resetProgress(values: Readonly<Record<string, number>> = {}): void {
    this.progressById.clear();
    for (const [k, v] of Object.entries(values)) this.progressById.set(k, v);
    this.notify();
  }

  progressSnapshot(): Record<string, number> {
    return Object.fromEntries(this.progressById);
  }

  subscribe(fn: (view: ObjectiveView | null) => void): () => void {
    this.listeners.add(fn);
    fn(this.current);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    const v = this.current;
    for (const fn of this.listeners) fn(v);
  }
}
