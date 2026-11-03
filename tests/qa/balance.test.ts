import { beforeAll, describe, expect, it } from 'vitest';
import { failureReasonText } from '../../src/gameplay/ui/screens';
import { ASSIST_AFTER_FAILURES, ASSIST_TIMER_BONUS, DIFFICULTY } from '../../src/core/difficulty';
import { FIXED_DT } from '../../src/core/loop';
import { MIN_TELEGRAPH_SECONDS, telegraphSeconds } from '../../src/gameplay/core/telegraph';
import { QUIZ_TRIES, QuizSession } from '../../src/gameplay/core/quiz';
import { loadChapter, loadLevel } from '../../src/gameplay/registry';
import type { AnyLevelDefinition, BotStep, ChapterDefinition } from '../../src/gameplay/types';
import { HEBREW } from '../../src/locales';
import { checkpointGaps, DIFFICULTIES, drive, HUMAN_FACTOR, startHost, type Probe } from './driver';

/**
 * Balance and fairness rules for the five Act 1 missions (BRIEF 4, DESIGN 3), measured with the
 * QA bot on the fixed timestep. A first-time human is modelled as HUMAN_FACTOR slower than the bot.
 */

const MISSIONS = ['archive-night', 'jaffa-letters', 'tower-stockade', 'night-landing', 'the-vote'] as const;
const CHAPTERS = ['prologue', 'ch01'] as const;
/** Checkpoint spacing limit in seconds of play (BRIEF 4: a checkpoint every 2-3 minutes). */
const MAX_CHECKPOINT_GAP = 180;
/** A timer must leave this multiple of the (slowed) bot time to a first-time player. */
const TIMER_HEADROOM = 2;

const defs = new Map<string, AnyLevelDefinition>();
const probes = new Map<string, Probe>();
const key = (id: string, d: string): string => id + ':' + d;

beforeAll(async () => {
  for (const id of MISSIONS) {
    const def = await loadLevel(id);
    defs.set(id, def);
    for (const d of DIFFICULTIES) probes.set(key(id, d), drive(def, { difficulty: d }));
  }
}, 300000);

const def = (id: string): AnyLevelDefinition => defs.get(id) as AnyLevelDefinition;
const probe = (id: string, d: string): Probe => probes.get(key(id, d)) as Probe;
const has = (k: string): boolean => Object.hasOwn(HEBREW, k);

describe('difficulty parameters', () => {
  it('telegraph never drops below the 2 s minimum and grows toward Story', () => {
    for (const d of DIFFICULTIES) expect(telegraphSeconds(DIFFICULTY[d])).toBeGreaterThanOrEqual(MIN_TELEGRAPH_SECONDS);
    expect(DIFFICULTY.story.telegraphSeconds).toBeGreaterThan(DIFFICULTY.normal.telegraphSeconds);
    expect(DIFFICULTY.normal.telegraphSeconds).toBeGreaterThan(DIFFICULTY.challenge.telegraphSeconds - 1e-9);
    expect(DIFFICULTY.story.timerScale).toBeGreaterThan(DIFFICULTY.normal.timerScale);
    expect(DIFFICULTY.normal.timerScale).toBeGreaterThan(DIFFICULTY.challenge.timerScale);
  });
});

describe.each(MISSIONS)('mission %s', (id) => {
  it('completes on every difficulty without a single failure or alert', () => {
    for (const d of DIFFICULTIES) {
      const p = probe(id, d);
      expect(p.completed, d + ': ' + p.log.join(' | ')).toBe(true);
      expect(p.failures, d).toEqual([]);
      // The bot is never seen: the danger meter must stay below full.
      expect(p.maxAlert, d).toBeLessThan(1);
    }
  });

  it('keeps checkpoints at most 3 minutes of play apart, with a slow first-time player', () => {
    for (const d of DIFFICULTIES) {
      const p = probe(id, d);
      const gaps = checkpointGaps(p);
      expect(p.checkpoints.length, d).toBeGreaterThanOrEqual(def(id).mission.checkpoints.length - 1);
      for (const g of gaps) expect(g * HUMAN_FACTOR, d + ' gaps ' + gaps.join(',')).toBeLessThanOrEqual(MAX_CHECKPOINT_GAP);
    }
  });

  it('always shows an objective: every playable state has one and the text exists', () => {
    const d = def(id);
    const states = Object.keys(d.mission.machine.transitions).filter((s) => s !== 'failed' && s !== 'complete');
    for (const s of states) {
      expect(
        d.objectives.some((o) => o.states.includes(s)),
        'objective for state ' + s,
      ).toBe(true);
    }
    for (const o of d.objectives) expect(has(o.textKey), o.textKey).toBe(true);
    for (const x of DIFFICULTIES) expect(probe(id, x).stepsWithoutObjective, x).toBe(0);
  });

  it('every checkpoint is a mission state and the first one is the initial state', () => {
    const d = def(id);
    expect(d.mission.checkpoints[0]).toBe(d.mission.machine.initial);
    for (const c of [...d.mission.checkpoints, ...(d.extraCheckpoints ?? [])]) expect(Object.hasOwn(d.mission.machine.transitions, c), c).toBe(true);
  });

  it('every failure has a what-really-happened text, a hint, a label and sources', () => {
    const d = def(id);
    const reasons = Object.entries(d.failures);
    expect(reasons.length).toBeGreaterThan(0);
    for (const [reason, info] of reasons) {
      expect(has(info.whatHappenedKey), reason + ' what happened').toBe(true);
      expect(has(info.hintKey), reason + ' hint').toBe(true);
      expect(info.label, reason).toBeTruthy();
      // Documented claims must cite sources; reconstructed staging and composites are labelled instead.
      if (info.label === 'documented') expect(info.sources.length, reason + ' sources').toBeGreaterThan(0);
    }
  });
});

describe('failure card heading', () => {
  it('never shows a raw failure id: unresolved reasons are omitted, keys show their text', () => {
    const t = (k: string): string => (has(k) ? 'TEXT:' + k : k);
    for (const id of MISSIONS) {
      for (const reason of Object.keys(def(id).failures)) {
        const shown = failureReasonText(t, reason);
        expect(shown === null || shown.startsWith('TEXT:'), id + '/' + reason).toBe(true);
      }
    }
  });
});

describe('soft-failure loop', () => {
  it.each(MISSIONS)('%s: failure card data, instant retry and offered (never forced) assist', (id) => {
    const d = def(id);
    for (const reason of Object.keys(d.failures)) {
      const { host, reports } = startHost(d, 'normal');
      const cp = host.checkpoint;
      const base = host.params;
      host.fail(reason);
      expect(host.phase).toBe('failed');
      expect(reports).toHaveLength(1);
      const r1 = reports[0];
      expect(r1?.info, reason).toBe(d.failures[reason]);
      expect(r1?.assistOptions, 'no assist after the first failure').toEqual([]);

      // Instant retry: same call, back at the checkpoint, running, no time needed.
      host.retry();
      expect(host.phase).toBe('running');
      expect(host.checkpoint).toBe(cp);
      expect(host.state).toBe(cp);

      // Second failure at the same checkpoint: assist is offered, still not applied.
      host.fail(reason);
      const r2 = reports[1];
      expect(r2?.failures).toBe(ASSIST_AFTER_FAILURES);
      expect(r2?.assistOptions, 'assist offered after 2 failures').toEqual(expect.arrayContaining(['hint', 'moreTime']));
      expect(host.params).toEqual(base);
      expect(host.assists.accepted.size).toBe(0);

      // Declining keeps everything as it was; accepting more time changes only the timer scale.
      host.declineAssist();
      host.retry();
      host.fail(reason);
      expect(reports[2]?.assistOptions, 'declined: not asked again at once').toEqual([]);
      host.retry();
      host.acceptAssist('moreTime');
      expect(host.params.timerScale).toBeCloseTo(base.timerScale * ASSIST_TIMER_BONUS, 9);
      expect(host.params.telegraphSeconds).toBe(base.telegraphSeconds);
      host.dispose();
    }
  });
});

interface TimerSpec {
  readonly level: string;
  readonly name: string;
  readonly baseSeconds: number;
  /** Bot time spent between these checkpoints (or to completion) must fit in the timer. */
  readonly from: string;
  readonly to: string | 'complete';
}

/** Every countdown in the five missions (base seconds before the difficulty scale). */
const TIMERS: readonly TimerSpec[] = [
  { level: 'tower-stockade', name: 'day clock (sunset)', baseSeconds: 600, from: 'dawn', to: 'complete' },
  { level: 'night-landing', name: 'landing before dawn', baseSeconds: 150, from: 'landing', to: 'shore' },
  { level: 'night-landing', name: 'shore before dawn', baseSeconds: 330, from: 'shore', to: 'complete' },
  { level: 'jaffa-letters', name: 'station bell', baseSeconds: 45, from: 'station', to: 'jerusalem_delivered' },
];

function botSeconds(p: Probe, from: string, to: string): number {
  const a = p.checkpoints.find((c) => c.checkpoint === from)?.at ?? 0;
  const b = to === 'complete' ? p.seconds : (p.checkpoints.find((c) => c.checkpoint === to)?.at ?? p.seconds);
  return b - a;
}

describe('night-landing pacing beats', () => {
  it('plays the scarf moment on open water and lets the closing line finish before the mission ends', () => {
    for (const d of DIFFICULTIES) {
      const p = probe('night-landing', d);
      const moment = p.subtitles.find((s) => s.textKey === 'ch01.landing.moment');
      const closing = p.subtitles.find((s) => s.textKey === 'ch01.landing.d2');
      expect(moment, d).toBeDefined();
      expect(closing, d).toBeDefined();
      expect((moment?.at ?? 99) + 7, d + ' moment is during the sea stages').toBeLessThan(p.checkpoints.find((c) => c.checkpoint === 'landing')?.at ?? 0);
      expect(p.seconds - (closing?.at ?? 0), d + ' closing line has time to be heard').toBeGreaterThanOrEqual(9);
    }
  });
});

describe('timers a first-time player can meet', () => {
  it.each(TIMERS)('$level $name leaves $baseSeconds s x scale at least 2x the slowed bot time', (t) => {
    for (const d of DIFFICULTIES) {
      const need = botSeconds(probe(t.level, d), t.from, t.to) * HUMAN_FACTOR;
      const have = t.baseSeconds * DIFFICULTY[d].timerScale;
      expect(have, d + ' need ' + need.toFixed(1)).toBeGreaterThanOrEqual(need * TIMER_HEADROOM);
    }
  });
});

interface ThreatProbe {
  readonly level: string;
  readonly name: string;
  readonly from: string;
  readonly script: readonly BotStep[];
  /** A beam sweeps past a standing point for less than the Story telegraph, so it never triggers there. */
  readonly immuneOnStory?: boolean;
}

const walk = (x: number, z: number): BotStep => ({ kind: 'walkTo', x, z, within: 1.5, timeout: 120 });
const hold: BotStep = { kind: 'wait', seconds: 120 };

/** Each telegraphed threat family: the probe stands still in the danger until it triggers. */
const THREATS: readonly ThreatProbe[] = [
  { level: 'night-landing', name: 'patrol boat cone', from: 'patrols', script: [walk(-143, 72), hold] },
  { level: 'night-landing', name: 'shore searchlight', from: 'lights', script: [walk(-110, -4), hold], immuneOnStory: true },
  { level: 'night-landing', name: 'beach watcher', from: 'shore', script: [walk(-48, -30), hold] },
  { level: 'jaffa-letters', name: 'sown field', from: 'road_colony', script: [walk(-47, 66), hold] },
];

describe('telegraphed threats warn for at least the difficulty minimum', () => {
  it.each(THREATS)('$level $name', async (t) => {
    const d = await loadLevel(t.level);
    for (const diff of DIFFICULTIES) {
      let first: number | null = null;
      const p = drive(d, {
        difficulty: diff,
        fromCheckpoint: t.from,
        script: { [t.from]: t.script },
        onStep: (s) => {
          if (s.alert > 0 && first === null) first = s.time;
          if (s.alert === 0) first = null;
        },
      });
      if (t.immuneOnStory && diff === 'story' && p.failures.length === 0) continue;
      expect(p.failures.length, diff + ' triggers: ' + p.log.join(' | ')).toBe(1);
      expect(first, diff + ' warned before failing').not.toBeNull();
      const warned = p.seconds - (first ?? p.seconds);
      expect(warned + 2 * FIXED_DT, diff + ' warning seconds').toBeGreaterThanOrEqual(telegraphSeconds(DIFFICULTY[diff]));
    }
  }, 120000);
});

describe.each(CHAPTERS)('quiz of chapter %s is forgiving', (chapterId) => {
  let chapter: ChapterDefinition;
  beforeAll(async () => {
    chapter = await loadChapter(chapterId);
  });

  it('allows retries after a wrong answer and rewards a late right answer', () => {
    const q = chapter.content.quiz;
    expect(q.length).toBeGreaterThan(0);
    const s = new QuizSession(q);
    const first = s.current;
    const wrong = first?.optionKeys.findIndex((_, i) => i !== first.correctIndex) ?? 0;
    const r = s.answer(wrong);
    expect(r.correct).toBe(false);
    expect(s.resolved).toBe(false);
    const ok = s.answer(first?.correctIndex ?? 0);
    expect(ok).toEqual({ correct: true, firstTry: false });
    expect(s.score().correct).toBe(1);
  });

  it('never blocks: all wrong, all skipped, or skipAll still finishes', () => {
    const q = chapter.content.quiz;
    const allWrong = new QuizSession(q);
    while (!allWrong.finished) {
      const cur = allWrong.current;
      if (!cur) break;
      let tries = 0;
      for (let i = 0; i < cur.optionKeys.length && tries < QUIZ_TRIES; i++) {
        if (i === cur.correctIndex) continue;
        allWrong.answer(i);
        tries++;
      }
      expect(allWrong.resolved).toBe(true);
      allWrong.next();
    }
    expect(allWrong.finished).toBe(true);
    expect(allWrong.score().stars).toBe(0);
    const skipped = new QuizSession(q);
    skipped.skipAll();
    expect(skipped.finished).toBe(true);
    expect(skipped.score().skipped).toBe(q.length);
  });

  it('every question has text, three options and an explanation', () => {
    for (const x of chapter.content.quiz) {
      expect(has(x.promptKey), x.promptKey).toBe(true);
      for (const o of x.optionKeys) expect(has(o), o).toBe(true);
      expect(has(x.explanationKey), x.explanationKey).toBe(true);
    }
  });
});
