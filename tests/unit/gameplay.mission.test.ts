import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { DifficultyLevel } from '../../src/core/difficulty';
import { EventBus } from '../../src/core/events';
import type { GameEvents } from '../../src/core/gameEvents';
import { createNewSave } from '../../src/core/save/schema';
import { ledgerRows, recordChoice, validateDecision, type DecisionDef } from '../../src/gameplay/core/ledger';
import { BotInput, runBot } from '../../src/gameplay/runtime/bot';
import { MissionHost, type FailureReport } from '../../src/gameplay/runtime/missionHost';
import sampleWalk, { SAMPLE_DECISION_ID } from '../../src/gameplay/sample/sampleWalk';
import { defineLevel, type Level } from '../../src/gameplay/types';
import { DEFAULT_WORLD_QUALITY } from '../../src/world/quality';

type S = 'a' | 'b' | 'c';
type E = 'next' | 'done';

/** Minimal level with no 3D world: state a -> b (checkpoint) -> c -> complete. */
const tiny = defineLevel<S, E>({
  id: 'tiny',
  chapterId: 'test',
  missionId: 'tiny',
  mission: {
    id: 'tiny',
    chapterId: 'test',
    gameplayType: 'PZL',
    checkpoints: ['a', 'b'],
    machine: { initial: 'a', final: ['complete'], transitions: { a: { next: 'b' }, b: { next: 'c' }, c: { done: 'complete' }, failed: {}, complete: {} } },
  },
  extraCheckpoints: ['c'],
  objectives: [
    { id: 'o1', textKey: 'o1', states: ['a'] },
    { id: 'o2', textKey: 'o2', states: ['b', 'c'], steps: 2 },
  ],
  failures: { boom: { whatHappenedKey: 'w', sources: ['P-001'], label: 'documented', hintKey: 'h' } },
  botScript: { a: [], b: [], c: [] },
  build(ctx) {
    const entered: string[] = [];
    const level: Level & { entered: string[] } = {
      entered,
      scene: { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), update: () => undefined, resize: () => undefined, dispose: () => undefined },
      update: () => undefined,
      enterCheckpoint: (cp) => {
        entered.push(cp + ':' + ctx.mission.state);
      },
      snapshotData: () => ({ marker: 42 }),
      dispose: () => undefined,
    };
    return level;
  },
});

function host(opts: { snapshot?: { missionId: string; state: string; checkpoint: string; data: unknown } | null } = {}): ReturnType<typeof makeHost> {
  return makeHost(opts);
}

function makeHost(o: { difficulty?: () => DifficultyLevel; snapshot?: { missionId: string; state: string; checkpoint: string; data: unknown } | null }) {
  const bus = new EventBus<GameEvents>();
  const events: string[] = [];
  bus.on('mission:failed', (e) => events.push('failed:' + e.reasonKey));
  bus.on('mission:checkpoint', (e) => events.push('cp:' + e.checkpoint));
  bus.on('mission:completed', () => events.push('completed'));
  bus.on('mission:objective', (e) => events.push('obj:' + e.objectiveKey));
  const failures: FailureReport[] = [];
  let completed = 0;
  const h = new MissionHost({
    def: tiny,
    bus,
    input: new BotInput(),
    difficulty: o.difficulty ?? (() => 'normal'),
    headless: true,
    quality: DEFAULT_WORLD_QUALITY,
    reducedMotion: () => false,
    t: (k) => k,
    glyph: (a) => a,
    recordChoice: () => undefined,
    snapshot: o.snapshot ?? null,
    hooks: {
      onFailed: (r) => failures.push(r),
      onDecision: () => undefined,
      onPlan: () => undefined,
      onComplete: () => completed++,
    },
  });
  return { h, events, failures, completed: () => completed };
}

describe('mission host: checkpoints, retry, assist', () => {
  it('runs objectives with mission states and completes', () => {
    const { h, events, completed } = host();
    h.start();
    expect(h.objectives.current?.id).toBe('o1');
    h.send('next');
    expect(h.objectives.current?.id).toBe('o2');
    h.send('next');
    h.send('done');
    expect(h.phase).toBe('complete');
    expect(completed()).toBe(1);
    expect(events).toEqual(['obj:o1', 'cp:b', 'obj:o2', 'completed']);
  });

  it('fails softly with the sourced card and retries from the last checkpoint', () => {
    const { h, failures } = host();
    const level = h.start() as Level & { entered: string[] };
    h.send('next');
    h.objectives.progress('o2', 1);
    h.send('next');
    h.objectives.progress('o2', 2);
    h.fail('boom');
    expect(h.phase).toBe('failed');
    expect(failures[0]?.info?.whatHappenedKey).toBe('w');
    expect(failures[0]?.assistOptions).toEqual([]);
    h.update(1);
    h.retry();
    expect(h.state).toBe('b');
    expect(h.phase).toBe('running');
    // Progress returns to what it was when checkpoint b was reached.
    expect(h.objectives.current?.done).toBe(0);
    expect(level.entered).toEqual(['a:a', 'b:b']);
  });

  it('offers (never forces) assists after 2 failures at the same checkpoint', () => {
    const { h, failures } = host();
    h.start();
    h.fail('boom');
    h.retry();
    h.fail('boom');
    expect(failures[1]?.assistOptions).toEqual(['hint', 'moreTime', 'extraCheckpoint']);
    expect(h.params.timerScale).toBe(1);
    h.declineAssist();
    h.retry();
    h.fail('boom');
    expect(failures[2]?.assistOptions).toEqual([]);
    h.retry();
    h.fail('boom');
    expect(failures[3]?.assistOptions.length).toBe(3);
    h.acceptAssist('moreTime');
    expect(h.params.timerScale).toBeCloseTo(1.3);
    h.acceptAssist('extraCheckpoint');
    h.retry();
    h.send('next');
    h.send('next');
    expect(h.checkpoint).toBe('c');
    h.fail('boom');
    h.retry();
    expect(h.state).toBe('c');
  });

  it('difficulty is read live (the pause menu can change it mid-mission)', () => {
    let level: DifficultyLevel = 'normal';
    const x = makeHost({ difficulty: () => level });
    x.h.start();
    expect(x.h.params.telegraphSeconds).toBe(2.5);
    level = 'story';
    expect(x.h.params.timerScale).toBe(1.6);
    expect(x.h.context.telegraph()).toBe(4);
  });

  it('a manual-save snapshot restores the exact state, objectives and level data', () => {
    const first = host();
    first.h.start();
    first.h.send('next');
    first.h.objectives.progress('o2', 1);
    first.h.send('next');
    const snap = first.h.snapshot();
    expect(snap).toMatchObject({ missionId: 'tiny', state: 'c', checkpoint: 'b' });
    const json = JSON.parse(JSON.stringify(snap)) as typeof snap;
    const second = host({ snapshot: json });
    const level = second.h.start() as Level & { entered: string[] };
    expect(second.h.state).toBe('c');
    expect(second.h.checkpoint).toBe('b');
    expect(second.h.objectives.current?.done).toBe(1);
    expect(level.entered).toEqual(['c:c']);
  });
});

const decision: DecisionDef = {
  id: 'm1-vote',
  promptKey: 'p',
  options: [
    { id: 'yes', labelKey: 'y', consequenceKey: 'yc' },
    { id: 'no', labelKey: 'n', consequenceKey: 'nc' },
  ],
  historical: { optionId: 'yes', textKey: 'h', sources: ['P-001'], label: 'documented' },
};

describe('decision ledger', () => {
  it('records choices into save.choices and compares them with history', () => {
    let s = createNewSave(0);
    s = recordChoice(s, decision, 'no');
    expect(s.choices).toEqual({ 'm1-vote': 'no' });
    const rows = ledgerRows([decision], s.choices);
    expect(rows[0]?.chosen?.id).toBe('no');
    expect(rows[0]?.matchesHistory).toBe(false);
    const again = ledgerRows([decision], recordChoice(s, decision, 'yes').choices);
    expect(again[0]?.matchesHistory).toBe(true);
    expect(ledgerRows([decision], {})[0]?.chosen).toBeNull();
    expect(() => recordChoice(s, decision, 'maybe')).toThrow();
  });

  it('validates decision definitions', () => {
    expect(validateDecision(decision)).toEqual([]);
    expect(validateDecision({ ...decision, historical: { ...decision.historical, optionId: 'x', sources: [] } })).toHaveLength(2);
  });
});

describe('QA bot on the sample level', () => {
  it('completes deterministically and logs the decision', () => {
    const a = runBot(sampleWalk, { difficulty: 'normal' });
    const b = runBot(sampleWalk, { difficulty: 'normal' });
    expect(a.completed).toBe(true);
    expect(a.steps).toBe(b.steps);
    expect(a.choices).toEqual({ [SAMPLE_DECISION_ID]: 'archive' });
    // Much faster than real time: a full mission in well under the mission timer.
    expect(a.seconds).toBeLessThan(30);
  });

  it('the sample can fail softly (timer) and the bot retries', () => {
    const bus = new EventBus<GameEvents>();
    const unlocks: string[] = [];
    bus.on('unlock:item', (e) => unlocks.push(e.kind + ':' + e.id));
    const idle = { ...sampleWalk, botScript: { ...sampleWalk.botScript, walk: [{ kind: 'wait' as const, seconds: 200 }] } };
    const r = runBot(idle, { difficulty: 'challenge', maxSeconds: 100, bus });
    expect(r.completed).toBe(false);
    expect(r.failures[0]?.reasonKey).toBe('gameplay.sample.fail.slow');
    // Challenge timer: 90 s x 0.8.
    expect(r.seconds).toBeCloseTo(72, 0);
    const ok = runBot(sampleWalk, { difficulty: 'story', bus });
    expect(ok.completed).toBe(true);
    expect(unlocks).toEqual(['archive:sample-letter']);
  });
});
