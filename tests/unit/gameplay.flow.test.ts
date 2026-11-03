import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { QuizQuestion } from '../../src/content/schema';
import { EventBus } from '../../src/core/events';
import { GameFlow } from '../../src/core/flow';
import type { GameEvents } from '../../src/core/gameEvents';
import { createNewSave, isSaveData } from '../../src/core/save/schema';
import { ChapterRun } from '../../src/gameplay/core/chapterRun';
import { applyUnlock, AssistPolicy, atMissionStart, buildRecap, completeChapter, completeMission, isUnlocked, nextMissionIndex, withMissionSnapshot } from '../../src/gameplay/core/progress';
import { QuizSession } from '../../src/gameplay/core/quiz';
import { chapterForSlot, chapterIds, loadChapter, loadLevel, levelIds } from '../../src/gameplay/registry';
import sampleChapter from '../../src/gameplay/sample/sampleChapter';
import type { ChapterDefinition } from '../../src/gameplay/types';
import { filterCodex } from '../../src/gameplay/ui/codex';
import { HEBREW } from '../../src/locales';

const q = (id: string, correctIndex: number, n = 3): QuizQuestion => ({
  id,
  label: 'documented',
  sources: ['P-001'],
  promptKey: 'p',
  optionKeys: Array.from({ length: n }, (_, i) => 'o' + String(i)),
  correctIndex,
  explanationKey: 'e',
});

describe('quiz (forgiving)', () => {
  it('allows retries, scores first tries higher and never blocks', () => {
    const s = new QuizSession([q('a', 1), q('b', 0), q('c', 2)]);
    expect(s.answer(1)).toEqual({ correct: true, firstTry: true });
    s.next();
    expect(s.answer(2)).toEqual({ correct: false, triesLeft: 1 });
    expect(s.answer(2)).toEqual({ correct: false, triesLeft: 1 });
    expect(s.answer(0)).toEqual({ correct: true, firstTry: false });
    s.next();
    s.next(); // skipped, no penalty beyond the score
    expect(s.finished).toBe(true);
    expect(s.score()).toEqual({ total: 3, correct: 2, firstTry: 1, skipped: 1, stars: 1 });
  });

  it('reveals after the allowed tries and can be skipped entirely', () => {
    const s = new QuizSession([q('a', 0), q('b', 0)]);
    s.answer(1);
    s.answer(2);
    expect(s.resolved).toBe(true);
    expect(() => s.answer(0)).toThrow();
    s.skipAll();
    expect(s.finished).toBe(true);
    expect(s.score().stars).toBe(0);
    const perfect = new QuizSession([q('a', 0), q('b', 1)]);
    perfect.answer(0);
    perfect.next();
    perfect.answer(1);
    perfect.next();
    expect(perfect.score().stars).toBe(3);
  });
});

function twoMissionChapter(cutscene: boolean): ChapterDefinition {
  const m = sampleChapter.content.missions[0];
  if (!m) throw new Error('sample mission');
  return {
    ...sampleChapter,
    levels: ['l1', 'l2'],
    ...(cutscene ? { cutsceneId: 'scene' } : {}),
    content: { ...sampleChapter.content, missions: [m, { ...m, id: 'm2' }] },
  };
}

describe('chapter flow transitions', () => {
  it('drives the real GameFlow: hub -> briefing -> missions -> cutscene -> debrief -> quiz -> hub', () => {
    const bus = new EventBus<GameEvents>();
    const flow = new GameFlow(bus);
    const states: string[] = [];
    bus.on('flow:changed', ({ to }) => states.push(to));
    flow.send('ready');
    flow.send('openHub');
    const run = new ChapterRun(twoMissionChapter(true));
    expect(run.needsContentNote).toBe(true);
    expect(flow.send('openBriefing')).toBe(true);
    expect(flow.send('startMission')).toBe(true);
    expect(run.afterMission(true)).toBe('missionDone');
    flow.send('missionDone');
    const next = run.afterDebrief();
    expect(next).toBe('nextMission');
    expect(run.levelId).toBe('l2');
    expect(flow.send(next)).toBe(true);
    flow.send('startMission');
    const ev = run.afterMission(true);
    expect(ev).toBe('playCutscene');
    flow.send(ev);
    flow.send('toDebrief');
    expect(run.afterDebrief()).toBe('toQuiz');
    flow.send('toQuiz');
    flow.send('toHub');
    expect(states).toEqual(['title', 'hub', 'briefing', 'mission', 'debrief', 'briefing', 'mission', 'cutscene', 'debrief', 'quiz', 'hub']);
  });

  it('skips the cutscene when cinematics are unavailable and rejects bad chapters', () => {
    const run = new ChapterRun(twoMissionChapter(true), 1);
    expect(run.afterMission(false)).toBe('missionDone');
    expect(() => new ChapterRun({ ...sampleChapter, levels: [] })).toThrow();
  });
});

describe('progress and saves', () => {
  it('unlocks, completes missions / chapters and keeps the save valid', () => {
    let s = createNewSave(0);
    s = applyUnlock(s, 'archive', 'x');
    s = applyUnlock(s, 'archive', 'x');
    s = applyUnlock(s, 'medal', 'steady-hands');
    s = applyUnlock(s, 'testimony', 't1');
    expect(s.unlocks.archive).toEqual(['x']);
    expect(isUnlocked(s, 'medal', 'steady-hands')).toBe(true);
    expect(isUnlocked(s, 'testimony', 't1')).toBe(true);
    s = atMissionStart(s, 'sample', 'sample-walk', 'walk');
    expect(s.resume).toEqual({ screen: 'briefing', chapterId: 'sample', mission: { missionId: 'sample-walk', state: 'walk', checkpoint: 'walk', data: null } });
    s = withMissionSnapshot(s, 'sample', { missionId: 'sample-walk', state: 'decide', checkpoint: 'interact', data: { level: { x: 1 } } });
    expect(isSaveData(JSON.parse(JSON.stringify(s)))).toBe(true);
    s = completeMission(s, 'sample', 'sample-walk', ['no-one-left-behind']);
    expect(s.resume.mission).toBeNull();
    expect(s.medals).toContain('no-one-left-behind');
    expect(nextMissionIndex(s, sampleChapter.content)).toBe(0);
    s = completeChapter(s, 'sample');
    expect(s.completedChapters).toEqual(['sample']);
    expect(isSaveData(s)).toBe(true);
  });

  it('builds the "Previously on" recap from completed missions, choices and the resume point', () => {
    let s = createNewSave(0);
    const content = twoMissionChapter(false).content;
    s = completeMission(s, 'sample', 'sample-walk');
    s = { ...s, choices: { 'sample-walk-share': 'archive', 'other-x': 'y' } };
    let r = buildRecap(s, content);
    expect(r.missionTitleKeys).toEqual(['gameplay.sample.mission.title']);
    expect(r.choicesMade).toBe(1);
    expect(r.resumesMission).toBe(false);
    expect(nextMissionIndex(s, content)).toBe(1);
    s = atMissionStart(s, 'sample', 'm2', 'walk');
    r = buildRecap(s, content);
    expect(r.resumesMission).toBe(true);
    expect(r.nextTitleKey).toBe('gameplay.sample.mission.title');
  });

  it('assist policy re-offers only after further failures', () => {
    const p = new AssistPolicy();
    expect(p.shouldOffer('a', 1, false)).toBe(false);
    expect(p.shouldOffer('a', 2, false)).toBe(true);
    expect(p.available(false)).toEqual(['hint', 'moreTime']);
    p.decline('a', 2);
    expect(p.shouldOffer('a', 3, false)).toBe(false);
    expect(p.shouldOffer('a', 4, false)).toBe(true);
    p.accept('hint');
    p.accept('moreTime');
    expect(p.shouldOffer('a', 10, false)).toBe(false);
  });
});

describe('registry', () => {
  it('lists and lazily loads levels and the sample chapter (dev/test builds only)', async () => {
    expect(levelIds()).toContain('sample-walk');
    expect(chapterIds()).toContain('sample');
    expect(chapterForSlot('prologue')).toBe('prologue');
    expect(chapterForSlot('ch05')).toBeNull();
    const ch = await loadChapter('sample');
    expect(ch.levels).toEqual(['sample-walk']);
    expect((await loadLevel('sample-walk')).missionId).toBe(ch.content.missions[0]?.id);
    await expect(loadLevel('nope')).rejects.toThrow();
  });
});

describe('codex search', () => {
  it('filters by category and translated text', () => {
    const t = (k: string): string => HEBREW[k] ?? k;
    const all = sampleChapter.content.codex;
    expect(filterCodex(all, 'all', '', t)).toHaveLength(2);
    expect(filterCodex(all, 'person', '', t).map((e) => e.id)).toEqual(['sample-guide']);
    expect(filterCodex(all, 'all', 'נועה', t).map((e) => e.id)).toEqual(['sample-guide']);
    expect(filterCodex(all, 'treaty', '', t)).toEqual([]);
  });
});

describe('gameplay locale', () => {
  it('every literal gameplay.* key used in code exists', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk(join(__dirname, '../../src/gameplay'));
    const missing: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/'(gameplay\.[a-zA-Z0-9.-]+[a-zA-Z0-9])'/g)) {
        const key = m[1] as string;
        if (!Object.hasOwn(HEBREW, key)) missing.push(key + ' in ' + f);
      }
    }
    expect(missing).toEqual([]);
    for (const k of ['documented', 'reconstructed', 'composite']) expect(Object.hasOwn(HEBREW, 'gameplay.label.' + k)).toBe(true);
    for (const k of ['story', 'normal', 'challenge']) expect(Object.hasOwn(HEBREW, 'gameplay.difficulty.' + k)).toBe(true);
  });
});
