import type { ChapterDefinition } from '../types';
import sampleWalk from './sampleWalk';

/**
 * SAMPLE CHAPTER (framework fixture, labeled FICTIONAL COMPOSITE, no historical claims). It is
 * listed only in dev and test builds and exercises the whole chapter flow end to end.
 */
const chapter: ChapterDefinition = {
  timelineId: 'prologue',
  sample: true,
  levels: ['sample-walk'],
  briefingContextKey: 'gameplay.sample.briefing.context',
  decisions: sampleWalk.decisions ?? [],
  content: {
    id: 'sample',
    titleKey: 'gameplay.sample.chapter.title',
    years: [1940, 1940],
    contentNote: true,
    missions: [
      {
        id: 'sample-walk',
        label: 'composite',
        sources: [],
        gameplayType: 'EXP',
        titleKey: 'gameplay.sample.mission.title',
        summaryKey: 'gameplay.sample.mission.summary',
        minutes: 10,
        learningGoalKeys: ['gameplay.sample.goal.move', 'gameplay.sample.goal.labels'],
      },
    ],
    codex: [
      { id: 'sample-archive', label: 'composite', sources: [], category: 'place', titleKey: 'gameplay.sample.codex.archive.title', bodyKey: 'gameplay.sample.codex.archive.body', year: 2026 },
      { id: 'sample-guide', label: 'composite', sources: [], category: 'person', titleKey: 'gameplay.sample.codex.guide.title', bodyKey: 'gameplay.sample.codex.guide.body', year: 2026 },
    ],
    archive: [
      {
        id: 'sample-letter',
        label: 'composite',
        sources: [],
        titleKey: 'gameplay.sample.archive.letter.title',
        descriptionKey: 'gameplay.sample.archive.letter.description',
        provenanceKey: 'gameplay.sample.archive.letter.provenance',
        license: 'recreation',
        year: 1940,
      },
    ],
    testimonies: [],
    facts: [{ id: 'sample-fact-labels', label: 'composite', sources: [], textKey: 'gameplay.sample.fact.labels' }],
    quiz: [
      {
        id: 'sample-q-labels',
        label: 'composite',
        sources: [],
        promptKey: 'gameplay.sample.quiz.labels.prompt',
        optionKeys: ['gameplay.sample.quiz.labels.a', 'gameplay.sample.quiz.labels.b', 'gameplay.sample.quiz.labels.c'],
        correctIndex: 1,
        explanationKey: 'gameplay.sample.quiz.labels.explain',
      },
      {
        id: 'sample-q-retry',
        label: 'composite',
        sources: [],
        promptKey: 'gameplay.sample.quiz.retry.prompt',
        optionKeys: ['gameplay.sample.quiz.retry.a', 'gameplay.sample.quiz.retry.b'],
        correctIndex: 0,
        explanationKey: 'gameplay.sample.quiz.retry.explain',
      },
    ],
  },
};

export default chapter;
