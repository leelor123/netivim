import type { ChapterContent, Sourced, ValidationContext } from './schema';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LABELS = new Set(['documented', 'reconstructed', 'composite']);

/** Returns every problem found; an empty list means the chapter may ship. */
export function validateChapter(ch: ChapterContent, ctx: ValidationContext): string[] {
  const problems: string[] = [];
  const p = (where: string, msg: string): void => {
    problems.push(ch.id + '/' + where + ': ' + msg);
  };
  const key = (where: string, k: string): void => {
    if (!ctx.localeKeys.has(k)) p(where, 'missing locale key ' + k);
  };

  const checkSourced = (kind: string, items: readonly Sourced[]): void => {
    const ids = new Set<string>();
    for (const it of items) {
      const where = kind + ':' + it.id;
      if (!KEBAB.test(it.id)) p(where, 'id must be kebab-case');
      if (ids.has(it.id)) p(where, 'duplicate id');
      ids.add(it.id);
      if (!LABELS.has(it.label)) p(where, 'invalid label');
      if (it.label === 'documented' && it.sources.length === 0) p(where, 'documented content needs a source');
      for (const s of it.sources) if (!ctx.sourceIds.has(s)) p(where, 'unknown source ' + s);
    }
  };

  key('chapter', ch.titleKey);
  if (ch.years[0] > ch.years[1]) p('chapter', 'years out of order');

  checkSourced('mission', ch.missions);
  const minMissions = ctx.minMissions ?? 3;
  if (ch.missions.length < minMissions || ch.missions.length > 5) p('chapter', 'needs ' + String(minMissions) + '-5 missions');
  const types = new Set<string>();
  for (const m of ch.missions) {
    const where = 'mission:' + m.id;
    if (types.has(m.gameplayType)) p(where, 'gameplay type repeats within the chapter');
    types.add(m.gameplayType);
    if (m.minutes < 10 || m.minutes > 25) p(where, 'minutes must be 10-25');
    if (m.sources.length === 0) p(where, 'every mission cites at least one source');
    key(where, m.titleKey);
    key(where, m.summaryKey);
    if (m.learningGoalKeys.length === 0) p(where, 'needs learning goals');
    for (const g of m.learningGoalKeys) key(where, g);
  }

  checkSourced('codex', ch.codex);
  for (const c of ch.codex) {
    key('codex:' + c.id, c.titleKey);
    key('codex:' + c.id, c.bodyKey);
  }

  checkSourced('archive', ch.archive);
  for (const a of ch.archive) {
    for (const k of [a.titleKey, a.descriptionKey, a.provenanceKey]) key('archive:' + a.id, k);
    if (a.sources.length === 0) p('archive:' + a.id, 'archive items always cite their source');
  }

  checkSourced('testimony', ch.testimonies);
  for (const t of ch.testimonies) {
    key('testimony:' + t.id, t.speakerKey);
    key('testimony:' + t.id, t.bodyKey);
    if (t.label === 'reconstructed') p('testimony:' + t.id, 'testimonies are documented paraphrases or labeled composites');
    if (t.sources.length === 0) p('testimony:' + t.id, 'testimonies always cite a source');
  }

  checkSourced('fact', ch.facts);
  for (const f of ch.facts) {
    key('fact:' + f.id, f.textKey);
    if (f.label !== 'documented') p('fact:' + f.id, 'Did You Know facts must be documented');
  }

  checkSourced('quiz', ch.quiz);
  if (ch.quiz.length < 5) p('chapter', 'quiz needs at least 5 questions');
  for (const q of ch.quiz) {
    const where = 'quiz:' + q.id;
    if (q.label !== 'documented') p(where, 'quiz answers must be documented');
    if (q.optionKeys.length < 2 || q.optionKeys.length > 4) p(where, 'needs 2-4 options');
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.optionKeys.length) p(where, 'correctIndex out of range');
    if (new Set(q.optionKeys).size !== q.optionKeys.length) p(where, 'duplicate options');
    for (const k of [q.promptKey, q.explanationKey, ...q.optionKeys]) key(where, k);
  }
  return problems;
}
