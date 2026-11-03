import type { ChapterContent, CodexEntry, Fact, QuizQuestion, Testimony, ArchiveItem, MissionMeta } from '../schema';
import { getEra } from '../eras';

/**
 * Prologue content. Only claims marked "approved for game use" in research/factcheck-ch00-ch01.md
 * appear in documented items. Composite characters are labeled and cite the context they are based on.
 */

const k = (...parts: string[]): string => 'ch00.' + parts.join('.');

const missions: readonly MissionMeta[] = [
  {
    id: 'archive-at-night',
    label: 'composite',
    sources: ['P-044', 'P-009', 'P-055'],
    gameplayType: 'EXP',
    titleKey: k('mission', 'archive', 'title'),
    summaryKey: k('mission', 'archive', 'summary'),
    minutes: 12,
    learningGoalKeys: [k('mission', 'archive', 'goal', '1'), k('mission', 'archive', 'goal', '2'), k('mission', 'archive', 'goal', '3')],
  },
  {
    id: 'letters-from-jaffa',
    label: 'reconstructed',
    sources: ['P-055', 'P-054', 'P-047', 'P-046', 'P-053', 'P-101'],
    gameplayType: 'LOG',
    titleKey: k('mission', 'jaffa', 'title'),
    summaryKey: k('mission', 'jaffa', 'summary'),
    minutes: 18,
    learningGoalKeys: [k('mission', 'jaffa', 'goal', '1'), k('mission', 'jaffa', 'goal', '2'), k('mission', 'jaffa', 'goal', '3')],
  },
];

function codex(id: string, category: CodexEntry['category'], year: number, sources: readonly string[]): CodexEntry {
  return { id, label: 'documented', sources, category, year, titleKey: k('codex', id, 'title'), bodyKey: k('codex', id, 'body') };
}

const codexEntries: readonly CodexEntry[] = [
  codex('old-yishuv-halukka', 'concept', 1850, ['P-054']),
  codex('yusuf-diya-al-khalidi', 'person', 1899, ['P-009']),
  codex('filastin-newspaper', 'organization', 1911, ['P-056']),
  codex('hovevei-zion', 'organization', 1884, ['P-048', 'P-050']),
  codex('rishon-lezion', 'place', 1882, ['P-047']),
  codex('petah-tikva', 'place', 1878, ['P-046']),
  codex('edmond-de-rothschild', 'person', 1882, ['P-047', 'P-046', 'P-050']),
  codex('herzl-first-congress', 'event', 1897, ['P-043', 'P-044', 'P-045']),
  codex('hashomer', 'organization', 1909, ['P-032', 'P-033']),
  codex('second-aliyah', 'event', 1904, ['P-052']),
  codex('beersheba', 'place', 1900, ['P-037']),
  codex('jaffa-jerusalem-railway', 'event', 1892, ['P-055']),
  codex('ottoman-land-law', 'concept', 1858, ['P-053']),
  codex('year-of-locusts', 'event', 1915, ['P-034']),
];

function archive(id: string, license: ArchiveItem['license'], year: number, sources: readonly string[]): ArchiveItem {
  return {
    id,
    label: 'documented',
    sources,
    license,
    year,
    titleKey: k('archive', id, 'title'),
    descriptionKey: k('archive', id, 'description'),
    provenanceKey: k('archive', id, 'provenance'),
  };
}

const archiveItems: readonly ArchiveItem[] = [
  archive('basel-program', 'recreation', 1897, ['P-044', 'P-031']),
  archive('herzl-diary-1897', 'excerpt', 1897, ['P-045']),
  archive('khalidi-letters-1899', 'excerpt', 1899, ['P-009']),
];

function testimony(id: string, label: Testimony['label'], sources: readonly string[]): Testimony {
  return { id, label, sources, speakerKey: k('testimony', id, 'speaker'), bodyKey: k('testimony', id, 'body') };
}

const testimonies: readonly Testimony[] = [
  testimony('khalidi-letter-1899', 'documented', ['P-009']),
  testimony('herzl-diary-1897', 'documented', ['P-045']),
  testimony('composite-jaffa-clerk', 'composite', ['P-055']),
  testimony('composite-old-yishuv', 'composite', ['P-054']),
  testimony('composite-colony', 'composite', ['P-047', 'P-046']),
  testimony('composite-village', 'composite', ['P-101', 'P-053']),
];

function fact(id: string, sources: readonly string[]): Fact {
  return { id, label: 'documented', sources, textKey: k('fact', id) };
}

const facts: readonly Fact[] = [
  fact('navon-franchise', ['P-055']),
  fact('beersheba-planned', ['P-037']),
  fact('beersheba-builders', ['P-037']),
  fact('filastin-closures', ['P-056']),
  fact('year-of-locusts', ['P-034']),
  fact('kattowitz-delegates', ['P-048']),
];

function quiz(id: string, optionCount: number, correctIndex: number, sources: readonly string[]): QuizQuestion {
  return {
    id,
    label: 'documented',
    sources,
    promptKey: k('quiz', id, 'prompt'),
    optionKeys: Array.from({ length: optionCount }, (_, i) => k('quiz', id, 'o' + String(i + 1))),
    correctIndex,
    explanationKey: k('quiz', id, 'exp'),
  };
}

const quizQuestions: readonly QuizQuestion[] = [
  quiz('congress-year', 4, 1, ['P-043', 'P-044']),
  quiz('basel-aim', 3, 0, ['P-044']),
  quiz('mother-of-moshavot', 3, 0, ['P-046']),
  quiz('railway-year', 4, 1, ['P-055']),
  quiz('beersheba', 4, 0, ['P-037']),
  quiz('halukka', 4, 0, ['P-054']),
  quiz('tapu-law', 3, 0, ['P-053']),
  quiz('filastin', 3, 0, ['P-056']),
];

export const CH00_ID = 'prologue';

export const CH00_CHAPTER: ChapterContent = {
  id: CH00_ID,
  titleKey: k('title'),
  years: getEra('prologue').years,
  contentNote: false,
  missions,
  codex: codexEntries,
  archive: archiveItems,
  testimonies,
  facts,
  quiz: quizQuestions,
};

/** "History covered" metadata for the prologue (BRIEF 5). */
export const CH00_HISTORY_COVERED = {
  periodKey: k('history', 'period'),
  noteKey: k('history', 'note'),
  years: getEra('prologue').years,
  /** Event IDs from eras.ts that the prologue touches. */
  eraEventIds: ['land-code-1858', 'rishon-1882', 'railway-1892', 'basel-1897', 'khalidi-1899', 'beersheba-1899', 'hashomer-1909', 'locust-1915'],
} as const;

/** Two Lenses (DESIGN feature): contested ground the prologue touches. Each narrative in its own terms. */
export interface LensNarrative {
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly sources: readonly string[];
}

export interface TwoLensesTopic {
  readonly id: string;
  readonly titleKey: string;
  readonly commonGroundKey: string;
  readonly limitsKey: string;
  readonly commonSources: readonly string[];
  readonly a: LensNarrative;
  readonly b: LensNarrative;
}

export const CH00_TWO_LENSES: readonly TwoLensesTopic[] = [
  {
    id: 'land-and-tenants',
    titleKey: k('lens', 'land', 'title'),
    commonGroundKey: k('lens', 'land', 'common'),
    limitsKey: k('lens', 'land', 'limits'),
    commonSources: ['P-101', 'P-102'],
    a: { titleKey: k('lens', 'land', 'a', 'title'), bodyKey: k('lens', 'land', 'a', 'body'), sources: ['P-046', 'P-047'] },
    b: { titleKey: k('lens', 'land', 'b', 'title'), bodyKey: k('lens', 'land', 'b', 'body'), sources: ['P-101', 'P-103'] },
  },
];
