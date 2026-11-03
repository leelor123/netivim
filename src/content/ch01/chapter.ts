import type { ArchiveItem, ChapterContent, CodexCategory, CodexEntry, ContentLabel, Fact, MissionMeta, QuizQuestion, Testimony } from '../schema';

/**
 * Chapter 1 "Roots" (1904-1947). Data only; the 3D levels are built later from missions.md.
 * Every claim comes from the approved lists in research/factcheck-ch00-ch01.md or from opened
 * entries in research/perspectives-ch00-ch01.md. Locale keys live in src/locales/he/ch01.json.
 */

const codex = (id: string, category: CodexCategory, year: number, sources: readonly string[], label: ContentLabel = 'documented'): CodexEntry => ({
  id,
  label,
  sources,
  category,
  year,
  titleKey: 'ch01.codex.' + id + '.title',
  bodyKey: 'ch01.codex.' + id + '.body',
});

const fact = (id: string, sources: readonly string[]): Fact => ({ id, label: 'documented', sources, textKey: 'ch01.fact.' + id });

const quiz = (id: string, sources: readonly string[], correctIndex: number): QuizQuestion => ({
  id,
  label: 'documented',
  sources,
  promptKey: 'ch01.quiz.' + id + '.prompt',
  optionKeys: ['ch01.quiz.' + id + '.o1', 'ch01.quiz.' + id + '.o2', 'ch01.quiz.' + id + '.o3'],
  correctIndex,
  explanationKey: 'ch01.quiz.' + id + '.exp',
});

const archive = (id: string, license: ArchiveItem['license'], year: number, sources: readonly string[]): ArchiveItem => ({
  id,
  label: 'documented',
  sources,
  license,
  year,
  titleKey: 'ch01.archive.' + id + '.title',
  descriptionKey: 'ch01.archive.' + id + '.desc',
  provenanceKey: 'ch01.archive.' + id + '.prov',
});

const testimony = (id: string, label: ContentLabel, sources: readonly string[]): Testimony => ({
  id,
  label,
  sources,
  speakerKey: 'ch01.testimony.' + id + '.speaker',
  bodyKey: 'ch01.testimony.' + id + '.body',
});

const mission = (
  id: string,
  short: string,
  gameplayType: MissionMeta['gameplayType'],
  minutes: number,
  sources: readonly string[],
): MissionMeta => ({
  id,
  label: 'reconstructed',
  sources,
  gameplayType,
  minutes,
  titleKey: 'ch01.mission.' + short + '.title',
  summaryKey: 'ch01.mission.' + short + '.summary',
  learningGoalKeys: ['1', '2', '3'].map((n) => 'ch01.mission.' + short + '.goal' + n),
});

export const CH01: ChapterContent = {
  id: 'ch01',
  titleKey: 'ch01.title',
  years: [1904, 1947],
  // 1929, the 1936-39 revolt and the Holocaust as background (BRIEF 4.11).
  contentNote: true,
  missions: [
    // Setting DOCUMENTED, characters and exact sequence RECONSTRUCTED.
    mission('tower-and-stockade', 'tower', 'PZL', 15, ['C1-064', 'C1-065', 'C1-058', 'C1-101', 'C1-103']),
    mission('night-landing', 'landing', 'STL', 18, ['C1-055', 'C1-002', 'C1-101']),
    mission('the-vote', 'vote', 'DEC', 12, ['C1-060', 'C1-057', 'C1-101']),
  ],
  codex: [
    codex('second-aliyah', 'event', 1904, ['P-052']),
    codex('hashomer', 'organization', 1909, ['P-032']),
    codex('degania', 'place', 1909, ['P-051']),
    codex('balfour', 'person', 1917, ['C1-001']),
    codex('lord-rothschild', 'person', 1917, ['C1-001']),
    codex('mandate', 'treaty', 1922, ['C1-005', 'C1-059']),
    codex('riots-1920-1921', 'event', 1920, ['C1-059', 'C1-106', 'C1-101']),
    codex('tel-hai', 'place', 1920, ['C1-063']),
    codex('trumpeldor', 'person', 1920, ['C1-063']),
    codex('hebron-safed-1929', 'event', 1929, ['C1-059', 'C1-105']),
    codex('haj-amin', 'person', 1936, ['C1-058']),
    codex('arab-higher-committee', 'organization', 1936, ['C1-058']),
    codex('arab-revolt', 'event', 1936, ['C1-058', 'C1-059', 'C1-101']),
    codex('tower-and-stockade', 'concept', 1936, ['C1-064', 'C1-065']),
    codex('tel-amal', 'place', 1936, ['C1-064', 'C1-065']),
    codex('peel-commission', 'event', 1937, ['C1-058', 'C1-101']),
    codex('white-paper', 'treaty', 1939, ['C1-002', 'C1-059', 'C1-101']),
    codex('anglo-american-committee', 'event', 1946, ['C1-059']),
    codex('irgun', 'organization', 1946, ['C1-061', 'C1-062']),
    codex('begin', 'person', 1946, ['C1-061']),
    codex('king-david-hotel', 'event', 1946, ['C1-061', 'C1-062']),
    codex('aliyah-bet', 'concept', 1945, ['C1-055']),
    codex('exodus-1947', 'event', 1947, ['C1-055']),
    codex('res-181', 'treaty', 1947, ['C1-060', 'C1-057']),
    codex('five-documents', 'concept', 1947, ['C1-001', 'C1-005', 'C1-058', 'C1-002', 'C1-060']),
  ],
  archive: [
    // Typeset re-creations of public-domain texts (Balfour, Mandate, White Paper).
    archive('balfour', 'public-domain', 1917, ['C1-001']),
    archive('mandate', 'public-domain', 1922, ['C1-005']),
    archive('white-paper', 'public-domain', 1939, ['C1-002', 'C1-066']),
    // Short typeset excerpts only; the Peel scan carries a ProQuest notice and is never used.
    archive('peel', 'recreation', 1937, ['C1-058']),
    archive('aacic', 'recreation', 1946, ['C1-059']),
    // UN document: reuse terms unconfirmed, so a short cited excerpt plus our own summary.
    archive('res181', 'excerpt', 1947, ['C1-060', 'C1-057']),
  ],
  testimonies: [
    testimony('settler', 'composite', ['C1-065']),
    testimony('tenant', 'composite', ['C1-101', 'C1-103']),
    testimony('passenger', 'composite', ['C1-055']),
    testimony('hebron', 'documented', ['C1-105']),
    testimony('khalidi', 'documented', ['C1-101']),
    testimony('hoffman', 'documented', ['C1-061']),
  ],
  facts: [
    fact('prefab', ['C1-065']),
    fact('haganah', ['C1-061']),
    fact('victims', ['C1-061']),
    fact('revolt-range', ['C1-059']),
    fact('warning', ['C1-061']),
    fact('peel-zones', ['C1-058']),
    fact('intercepted', ['C1-055']),
    fact('hebron-families', ['C1-105']),
    fact('uk-abstained', ['C1-060']),
  ],
  quiz: [
    quiz('balfour', ['C1-001'], 1),
    quiz('tel-amal', ['C1-064', 'C1-065'], 0),
    quiz('strike', ['C1-058'], 1),
    quiz('white-paper', ['C1-002'], 1),
    quiz('king-david', ['C1-061'], 0),
    quiz('exodus', ['C1-055'], 1),
    quiz('vote', ['C1-060'], 2),
    quiz('jerusalem', ['C1-060'], 2),
    quiz('mandate', ['C1-005'], 0),
    quiz('peel', ['C1-058'], 0),
  ],
};
