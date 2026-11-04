import type { ContentLabel } from './schema';

/**
 * Era data for the timeline and the Living Map (DESIGN features 1 and 2).
 *
 * Rules (BRIEF 5): only claims that the research registers mark as fetched / read ([F] or [R])
 * appear here, each with its label and source IDs. Chapters 3 to 11 and the epilogue are shells
 * (title and years only) until their research lands. Disputed facts say who reports what; casualty
 * and population figures are given as ranges or left out.
 */

export const CHAPTER_IDS = [
  'prologue',
  'ch01',
  'ch02',
  'ch03',
  'ch04',
  'ch05',
  'ch06',
  'ch07',
  'ch08',
  'ch09',
  'ch10',
  'ch11',
  'epilogue',
] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];

export interface KeyEvent {
  /** kebab-case, unique across all eras. */
  readonly id: string;
  readonly year: number;
  /** 1-12. */
  readonly month?: number;
  readonly day?: number;
  /** End of a date range inside the same year (for example 29-31 August). */
  readonly endMonth?: number;
  readonly endDay?: number;
  /** Hebrew sentence, locale key. */
  readonly textKey: string;
  readonly label: ContentLabel;
  /** IDs from research/sources-ch0N.md (P-, C1-, C2-). */
  readonly sources: readonly string[];
}

export interface Era {
  readonly id: ChapterId;
  readonly titleKey: string;
  readonly summaryKey: string;
  /** Scope of the chapter, [start, end]; also the timeline scale. */
  readonly years: readonly [number, number];
  /** True until the chapter has researched content: no factual claims are shown. */
  readonly shell: boolean;
  readonly events: readonly KeyEvent[];
}

const SHELL_SUMMARY = 'timeline.era.shell.summary';

function shell(id: ChapterId, years: readonly [number, number]): Era {
  return { id, titleKey: 'timeline.era.' + id + '.title', summaryKey: SHELL_SUMMARY, years, shell: true, events: [] };
}

export const ERAS: readonly Era[] = [
  {
    id: 'prologue',
    titleKey: 'timeline.era.prologue.title',
    summaryKey: 'timeline.era.prologue.summary',
    years: [1850, 1918],
    shell: false,
    events: [
      { id: 'land-code-1858', year: 1858, textKey: 'timeline.event.land-code-1858', label: 'documented', sources: ['P-053'] },
      { id: 'rishon-1882', year: 1882, textKey: 'timeline.event.rishon-1882', label: 'documented', sources: ['P-047'] },
      { id: 'railway-1892', year: 1892, month: 9, day: 26, textKey: 'timeline.event.railway-1892', label: 'documented', sources: ['P-055'] },
      { id: 'basel-1897', year: 1897, month: 8, textKey: 'timeline.event.basel-1897', label: 'documented', sources: ['P-031'] },
      { id: 'beersheba-1899', year: 1899, textKey: 'timeline.event.beersheba-1899', label: 'documented', sources: ['P-037', 'P-038'] },
      { id: 'khalidi-1899', year: 1899, month: 3, day: 1, textKey: 'timeline.event.khalidi-1899', label: 'documented', sources: ['P-009'] },
      { id: 'hashomer-1909', year: 1909, month: 4, textKey: 'timeline.event.hashomer-1909', label: 'documented', sources: ['P-032', 'P-033'] },
      { id: 'locust-1915', year: 1915, textKey: 'timeline.event.locust-1915', label: 'documented', sources: ['P-034'] },
    ],
  },
  {
    id: 'ch01',
    titleKey: 'timeline.era.ch01.title',
    summaryKey: 'timeline.era.ch01.summary',
    years: [1904, 1947],
    shell: false,
    events: [
      { id: 'balfour-1917', year: 1917, month: 11, day: 2, textKey: 'timeline.event.balfour-1917', label: 'documented', sources: ['C1-001'] },
      { id: 'mandate-1922', year: 1922, month: 7, day: 24, textKey: 'timeline.event.mandate-1922', label: 'documented', sources: ['C1-005'] },
      { id: 'riots-1929', year: 1929, month: 8, day: 23, endMonth: 8, endDay: 29, textKey: 'timeline.event.riots-1929', label: 'documented', sources: ['C1-059', 'C1-101'] },
      { id: 'revolt-1936', year: 1936, month: 4, day: 20, textKey: 'timeline.event.revolt-1936', label: 'documented', sources: ['C1-058'] },
      { id: 'tower-1936', year: 1936, month: 12, day: 10, textKey: 'timeline.event.tower-1936', label: 'documented', sources: ['C1-064', 'C1-065'] },
      { id: 'peel-1937', year: 1937, month: 7, textKey: 'timeline.event.peel-1937', label: 'documented', sources: ['C1-058', 'C1-101'] },
      // unscop-1947 removed: no opened source for the date (research/review-ch00-ch01.md).
      { id: 'whitepaper-1939', year: 1939, month: 5, textKey: 'timeline.event.whitepaper-1939', label: 'documented', sources: ['C1-002'] },
      { id: 'kingdavid-1946', year: 1946, month: 7, day: 22, textKey: 'timeline.event.kingdavid-1946', label: 'documented', sources: ['C1-061', 'C1-062'] },
      { id: 'exodus-1947', year: 1947, month: 7, textKey: 'timeline.event.exodus-1947', label: 'documented', sources: ['C1-055'] },
      { id: 'vote-1947', year: 1947, month: 11, day: 29, textKey: 'timeline.event.vote-1947', label: 'documented', sources: ['C1-057'] },
    ],
  },
  {
    id: 'ch02',
    titleKey: 'timeline.era.ch02.title',
    summaryKey: 'timeline.era.ch02.summary',
    years: [1947, 1949],
    shell: false,
    events: [
      { id: 'civilwar-1947', year: 1947, month: 11, day: 30, textKey: 'timeline.event.civilwar-1947', label: 'documented', sources: ['C2-129', 'C2-105'] },
      { id: 'nachshon-1948', year: 1948, month: 4, day: 6, textKey: 'timeline.event.nachshon-1948', label: 'documented', sources: ['C2-114'] },
      { id: 'deiryassin-1948', year: 1948, month: 4, day: 9, textKey: 'timeline.event.deiryassin-1948', label: 'documented', sources: ['C2-110', 'C2-109', 'C2-108'] },
      { id: 'hadassah-1948', year: 1948, month: 4, day: 13, textKey: 'timeline.event.hadassah-1948', label: 'documented', sources: ['C2-115', 'C2-116', 'C2-117'] },
      { id: 'vote-may-1948', year: 1948, month: 5, day: 12, textKey: 'timeline.event.vote-may-1948', label: 'documented', sources: ['C2-104'] },
      { id: 'declaration-1948', year: 1948, month: 5, day: 14, textKey: 'timeline.event.declaration-1948', label: 'documented', sources: ['C2-101', 'C2-104', 'C2-102'] },
      { id: 'armies-1948', year: 1948, month: 5, day: 15, textKey: 'timeline.event.armies-1948', label: 'documented', sources: ['C2-125', 'C2-111', 'C2-102', 'C2-103'] },
      { id: 'latrun-1948', year: 1948, month: 5, day: 24, endMonth: 5, endDay: 25, textKey: 'timeline.event.latrun-1948', label: 'documented', sources: ['C2-118'] },
      { id: 'burma-1948', year: 1948, month: 6, textKey: 'timeline.event.burma-1948', label: 'documented', sources: ['C2-113'] },
      { id: 'negba-1948', year: 1948, month: 6, day: 2, textKey: 'timeline.event.negba-1948', label: 'documented', sources: ['C2-119', 'C2-130'] },
      { id: 'dani-1948', year: 1948, month: 7, day: 9, textKey: 'timeline.event.dani-1948', label: 'documented', sources: ['C2-111', 'C2-108', 'C2-112'] },
      { id: 'bernadotte-1948', year: 1948, month: 9, day: 17, textKey: 'timeline.event.bernadotte-1948', label: 'documented', sources: ['C2-121', 'C2-120'] },
      { id: 'res194-1948', year: 1948, month: 12, day: 11, textKey: 'timeline.event.res194-1948', label: 'documented', sources: ['C2-122', 'C2-105'] },
      { id: 'armistice-1949', year: 1949, month: 2, day: 24, textKey: 'timeline.event.armistice-1949', label: 'documented', sources: ['C2-113', 'C2-123', 'C2-124'] },
      { id: 'uvda-1949', year: 1949, month: 3, day: 10, textKey: 'timeline.event.uvda-1949', label: 'documented', sources: ['C2-126', 'C2-127', 'C2-113'] },
    ],
  },
  // Chapter shells: title and scope only. Years are the scope named in DESIGN section 2, not claims.
  shell('ch03', [1949, 1956]),
  shell('ch04', [1967, 1967]),
  shell('ch05', [1967, 1973]),
  shell('ch06', [1976, 1981]),
  shell('ch07', [1982, 1985]),
  shell('ch08', [1987, 1994]),
  shell('ch09', [2000, 2006]),
  shell('ch10', [2008, 2021]),
  // Chapter 11 is data-driven (BRIEF 5): its end year moves with the "History covered up to" date.
  shell('ch11', [2023, 2026]),
  shell('epilogue', [2026, 2026]),
];

export function getEra(id: ChapterId): Era {
  const era = ERAS.find((e) => e.id === id);
  if (!era) throw new Error('Unknown era ' + id);
  return era;
}

export function isChapterId(value: string): value is ChapterId {
  return (CHAPTER_IDS as readonly string[]).includes(value);
}

/** Year the timeline shows when an era is selected: the end of its scope. */
export function eraAnchorYear(era: Era): number {
  return era.years[1];
}

/** All events of all eras, ordered by date. */
export function allEvents(): readonly KeyEvent[] {
  return ERAS.flatMap((e) => e.events).sort(
    (a, b) => a.year - b.year || (a.month ?? 0) - (b.month ?? 0) || (a.day ?? 0) - (b.day ?? 0),
  );
}

export type ChapterStatus = 'locked' | 'unlocked' | 'completed';

/**
 * Progress rule: the first chapter is open; each next chapter opens when the one before it is
 * completed. A shell chapter has nothing to play yet, so it stays locked.
 */
export function chapterStatus(index: number, completedChapters: ReadonlySet<string>): ChapterStatus {
  const era = ERAS[index];
  if (!era) return 'locked';
  if (completedChapters.has(era.id)) return 'completed';
  if (era.shell) return 'locked';
  if (index === 0) return 'unlocked';
  const previous = ERAS[index - 1];
  return previous && completedChapters.has(previous.id) ? 'unlocked' : 'locked';
}
