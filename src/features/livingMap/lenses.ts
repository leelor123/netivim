import type { ChapterId } from '../../content/eras';
import type { ContentLabel } from '../../content/schema';

/**
 * Two Lenses (DESIGN feature 1): labeled narrative overlays over the same terrain and era. Each lens
 * says whose narrative it is, in that narrative's own terms, with sources. Switching a lens never
 * changes the underlying facts, only the framing and the per-place captions.
 */
export type LensId = 'independence' | 'nakba';

export interface Lens {
  readonly id: LensId;
  /** Short label, e.g. "War of Independence (Israeli narrative)". */
  readonly labelKey: string;
  /** What this narrative says, in its own terms. */
  readonly bodyKey: string;
  readonly label: ContentLabel;
  readonly sources: readonly string[];
}

export interface LensSet {
  readonly eraId: ChapterId;
  readonly lenses: readonly Lens[];
}

export const LENS_SETS: readonly LensSet[] = [
  {
    eraId: 'ch02',
    lenses: [
      {
        id: 'independence',
        labelKey: 'timeline.lens.independence.label',
        bodyKey: 'timeline.lens.independence.body',
        label: 'documented',
        sources: ['C2-101', 'C2-105'],
      },
      {
        id: 'nakba',
        labelKey: 'timeline.lens.nakba.label',
        bodyKey: 'timeline.lens.nakba.body',
        label: 'documented',
        sources: ['C2-105', 'C2-106', 'C2-107', 'C2-122'],
      },
    ],
  },
];

export function lensSetFor(eraId: ChapterId): LensSet | null {
  return LENS_SETS.find((s) => s.eraId === eraId) ?? null;
}

type Listener = (eraId: ChapterId, lens: Lens | null) => void;

/** Which lens is active per era. Pure state, no DOM. */
export class LensState {
  private readonly chosen = new Map<ChapterId, LensId>();
  private readonly listeners = new Set<Listener>();

  constructor(private readonly sets: readonly LensSet[] = LENS_SETS) {}

  hasLenses(eraId: ChapterId): boolean {
    return this.sets.some((s) => s.eraId === eraId);
  }

  /** Active lens for an era (the first lens until the player switches), or null when none exist. */
  active(eraId: ChapterId): Lens | null {
    const set = this.sets.find((s) => s.eraId === eraId);
    if (!set) return null;
    const id = this.chosen.get(eraId);
    return set.lenses.find((l) => l.id === id) ?? (set.lenses[0] as Lens);
  }

  set(eraId: ChapterId, id: LensId): boolean {
    const set = this.sets.find((s) => s.eraId === eraId);
    const lens = set?.lenses.find((l) => l.id === id);
    if (!lens) return false;
    if (this.active(eraId)?.id !== id) {
      this.chosen.set(eraId, id);
      this.emit(eraId);
    }
    return true;
  }

  /** Cycles to the next (or previous) lens; returns the new active lens, or null when the era has none. */
  cycle(eraId: ChapterId, step: 1 | -1 = 1): Lens | null {
    const set = this.sets.find((s) => s.eraId === eraId);
    const current = this.active(eraId);
    if (!set || !current) return null;
    const i = set.lenses.findIndex((l) => l.id === current.id);
    const next = set.lenses[(i + step + set.lenses.length) % set.lenses.length] as Lens;
    this.set(eraId, next.id);
    return next;
  }

  toggle(eraId: ChapterId): Lens | null {
    return this.cycle(eraId, 1);
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(eraId: ChapterId): void {
    const lens = this.active(eraId);
    for (const fn of this.listeners) fn(eraId, lens);
  }
}
