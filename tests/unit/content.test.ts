import { describe, expect, it } from 'vitest';
import type { ChapterContent, MissionMeta, QuizQuestion } from '../../src/content/schema';
import { validateChapter } from '../../src/content/validate';

const keys = new Set(['t', 's', 'g', 'o1', 'o2', 'o3', 'e', 'p']);
const ctx = { sourceIds: new Set(['C1-001', 'C1-002']), localeKeys: keys };

const mission = (id: string, gameplayType: MissionMeta['gameplayType']): MissionMeta => ({
  id,
  label: 'reconstructed',
  sources: ['C1-001'],
  gameplayType,
  titleKey: 't',
  summaryKey: 's',
  minutes: 15,
  learningGoalKeys: ['g'],
});

const q = (id: string): QuizQuestion => ({
  id,
  label: 'documented',
  sources: ['C1-002'],
  promptKey: 'p',
  optionKeys: ['o1', 'o2', 'o3'],
  correctIndex: 1,
  explanationKey: 'e',
});

const balfour = { id: 'balfour', label: 'documented', sources: ['C1-001'], category: 'treaty', titleKey: 't', bodyKey: 's', year: 1917 } as const;
const olim = { id: 'olim', label: 'composite', sources: ['C1-002'], speakerKey: 't', bodyKey: 's' } as const;

const good: ChapterContent = {
  id: 'ch01',
  titleKey: 't',
  years: [1904, 1947],
  contentNote: false,
  missions: [mission('tower', 'PZL'), mission('landing', 'STL'), mission('vote', 'DEC')],
  codex: [balfour],
  archive: [{ id: 'letter', label: 'documented', sources: ['C1-001'], titleKey: 't', descriptionKey: 's', provenanceKey: 'p', license: 'public-domain', year: 1917 }],
  testimonies: [olim],
  facts: [{ id: 'f1', label: 'documented', sources: ['C1-002'], textKey: 't' }],
  quiz: [q('q1'), q('q2'), q('q3'), q('q4'), q('q5')],
};

describe('validateChapter', () => {
  it('accepts a complete, sourced chapter', () => {
    expect(validateChapter(good, ctx)).toEqual([]);
  });

  it('catches unsourced documented content and unknown sources', () => {
    const bad: ChapterContent = {
      ...good,
      codex: [{ ...balfour, sources: [] }],
      facts: [{ id: 'f1', label: 'documented', sources: ['XX-9'], textKey: 't' }],
    };
    const problems = validateChapter(bad, ctx).join('\n');
    expect(problems).toContain('codex:balfour: documented content needs a source');
    expect(problems).toContain('fact:f1: unknown source XX-9');
  });

  it('catches missing locale keys, bad ids and duplicates', () => {
    const bad: ChapterContent = { ...good, titleKey: 'nope', missions: [mission('Bad_Id', 'PZL'), mission('x', 'STL'), mission('x', 'DEC')] };
    const problems = validateChapter(bad, ctx).join('\n');
    expect(problems).toContain('missing locale key nope');
    expect(problems).toContain('id must be kebab-case');
    expect(problems).toContain('duplicate id');
  });

  it('enforces mission variety, length and count', () => {
    const bad: ChapterContent = { ...good, missions: [mission('a', 'PZL'), { ...mission('b', 'PZL'), minutes: 40 }] };
    const problems = validateChapter(bad, ctx).join('\n');
    expect(problems).toContain('gameplay type repeats');
    expect(problems).toContain('minutes must be 10-25');
    expect(problems).toContain('needs 3-5 missions');
    expect(validateChapter({ ...good, missions: good.missions.slice(0, 2) }, { ...ctx, minMissions: 2 })).toEqual([]);
  });

  it('keeps quiz and facts strictly documented and well-formed', () => {
    const bad: ChapterContent = {
      ...good,
      facts: [{ id: 'f1', label: 'reconstructed', sources: [], textKey: 't' }],
      quiz: [{ ...q('q1'), correctIndex: 3 }, { ...q('q2'), label: 'composite' }, { ...q('q3'), optionKeys: ['o1', 'o1'] }],
    };
    const problems = validateChapter(bad, ctx).join('\n');
    expect(problems).toContain('Did You Know facts must be documented');
    expect(problems).toContain('correctIndex out of range');
    expect(problems).toContain('quiz answers must be documented');
    expect(problems).toContain('duplicate options');
    expect(problems).toContain('quiz needs at least 5 questions');
  });

  it('rejects reconstructed testimonies', () => {
    const bad: ChapterContent = { ...good, testimonies: [{ ...olim, label: 'reconstructed' }] };
    expect(validateChapter(bad, ctx).join('\n')).toContain('testimonies are documented paraphrases');
  });
});
