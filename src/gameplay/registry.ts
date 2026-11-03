import type { ChapterId } from '../content/eras';
import type { AnyLevelDefinition, ChapterDefinition } from './types';

/**
 * Lazy registry of chapters and levels. CHAPTER BUILDERS: append one line per level to LEVELS and
 * one line per chapter to CHAPTERS (dynamic imports keep each chapter in its own chunk), e.g.
 *
 *   'ch01-tower': () => import('../levels/ch01/tower').then((m) => m.default),
 *   ch01: () => import('../content/ch01/chapter').then((m) => m.default),
 *
 * A level module's default export is a LevelDefinition (use defineLevel); a chapter module's
 * default export is a ChapterDefinition.
 */

export type Loader<T> = () => Promise<T>;

export const LEVELS: Record<string, Loader<AnyLevelDefinition>> = {
  // SAMPLE (framework test level, not content).
  'sample-walk': () => import('./sample/sampleWalk').then((m) => m.default),
  // Chapter levels go below this line.
  'tower-stockade': () => import('../levels/ch01/tower-stockade').then((m) => m.default),
  'archive-night': () => import('../levels/ch00/archive-night').then((m) => m.default),
  'the-vote': () => import('../levels/ch01/the-vote').then((m) => m.default),
};

export const CHAPTERS: Record<string, Loader<ChapterDefinition>> = {
  // SAMPLE chapter: only listed in dev and test builds (see sampleAllowed).
  sample: () => import('./sample/sampleChapter').then((m) => m.default),
  // Chapters go below this line.
  ch01: () => import('../levels/ch01/chapter').then((m) => m.default),
  prologue: () => import('../levels/ch00/chapter').then((m) => m.default),
};

/** Timeline slot of each registered chapter, known without loading it. */
export const CHAPTER_SLOTS: Record<string, ChapterId> = {
  sample: 'prologue',
  ch01: 'ch01',
  prologue: 'prologue',
};

/** The sample chapter is never offered in a release build. */
export function sampleAllowed(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_TEST_HOOKS === '1';
}

const levelCache = new Map<string, Promise<AnyLevelDefinition>>();
const chapterCache = new Map<string, Promise<ChapterDefinition>>();

export function levelIds(): string[] {
  return Object.keys(LEVELS);
}

export function chapterIds(): string[] {
  return Object.keys(CHAPTERS).filter((id) => id !== 'sample' || sampleAllowed());
}

export function loadLevel(id: string): Promise<AnyLevelDefinition> {
  const loader = Object.hasOwn(LEVELS, id) ? LEVELS[id] : undefined;
  if (!loader) return Promise.reject(new Error('Unknown level ' + id));
  let p = levelCache.get(id);
  if (!p) {
    p = loader();
    levelCache.set(id, p);
    p.catch(() => levelCache.delete(id));
  }
  return p;
}

export function loadChapter(id: string): Promise<ChapterDefinition> {
  const loader = Object.hasOwn(CHAPTERS, id) ? CHAPTERS[id] : undefined;
  if (!loader) return Promise.reject(new Error('Unknown chapter ' + id));
  let p = chapterCache.get(id);
  if (!p) {
    p = loader();
    chapterCache.set(id, p);
    p.catch(() => chapterCache.delete(id));
  }
  return p;
}

/** Registered chapter for a timeline slot; real chapters win over the sample. */
export function chapterForSlot(slot: ChapterId): string | null {
  const ids = chapterIds().filter((id) => CHAPTER_SLOTS[id] === slot);
  return ids.find((id) => id !== 'sample') ?? ids[0] ?? null;
}

/** Loads every listed chapter (codex and archive read their content). Failures are skipped. */
export async function loadAllChapters(): Promise<ChapterDefinition[]> {
  const out: ChapterDefinition[] = [];
  for (const id of chapterIds()) {
    try {
      out.push(await loadChapter(id));
    } catch (e) {
      console.error('[netivim] chapter ' + id + ' failed to load', e);
    }
  }
  return out;
}
