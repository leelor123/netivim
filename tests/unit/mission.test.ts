import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/events';
import type { GameEvents } from '../../src/core/gameEvents';
import { analyzeMission, MissionRuntime, type MissionDefinition } from '../../src/core/mission';
import { ASSIST_TIMER_BONUS, DIFFICULTY, effectiveParams } from '../../src/core/difficulty';

type S = 'loadTrucks' | 'drive' | 'pass' | 'arrive';
type E = 'loaded' | 'depart' | 'reachPass' | 'through';

const convoy: MissionDefinition<S, E> = {
  id: 'test-convoy',
  chapterId: 'ch02',
  gameplayType: 'CNV',
  checkpoints: ['loadTrucks', 'pass'],
  machine: {
    initial: 'loadTrucks',
    final: ['complete'],
    transitions: {
      loadTrucks: { loaded: 'drive' },
      drive: { reachPass: 'pass' },
      pass: { through: 'arrive' },
      arrive: { depart: 'complete' },
      failed: {},
      complete: {},
    },
  },
};

function setup(): { bus: EventBus<GameEvents>; m: MissionRuntime<S, E>; log: string[] } {
  const bus = new EventBus<GameEvents>();
  const log: string[] = [];
  bus.on('mission:checkpoint', ({ checkpoint }) => log.push('cp:' + checkpoint));
  bus.on('mission:failed', ({ failures }) => log.push('fail:' + String(failures)));
  bus.on('mission:completed', () => log.push('done'));
  const m = new MissionRuntime(convoy, bus);
  return { bus, m, log };
}

describe('analyzeMission', () => {
  it('accepts a solvable mission', () => {
    const r = analyzeMission(convoy);
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('detects a softlock state', () => {
    const broken: MissionDefinition<S | 'stuck', E | 'trap'> = {
      ...convoy,
      machine: {
        ...convoy.machine,
        transitions: { ...convoy.machine.transitions, drive: { reachPass: 'pass', trap: 'stuck' }, stuck: {} },
      },
    };
    const r = analyzeMission(broken);
    expect(r.ok).toBe(false);
    expect(r.cannotFinish).toContain('stuck');
  });

  it('requires the initial state to be a checkpoint', () => {
    const r = analyzeMission({ ...convoy, checkpoints: ['pass'] });
    expect(r.problems).toContain('initial state must be a checkpoint');
  });
});

describe('MissionRuntime', () => {
  it('records checkpoints in memory and retries from the last one', () => {
    const { m, log } = setup();
    m.start();
    m.send('loaded');
    m.send('reachPass');
    expect(m.checkpoint).toBe('pass');
    m.fail('mission.fail.ambush');
    expect(m.state).toBe('failed');
    m.retry();
    expect(m.state).toBe('pass');
    expect(log).toEqual(['cp:pass', 'fail:1', 'cp:pass']);
  });

  it('offers assist after two failures at the same checkpoint only', () => {
    const { m } = setup();
    m.start();
    m.fail('x');
    m.retry();
    expect(m.shouldOfferAssist).toBe(false);
    m.fail('x');
    expect(m.shouldOfferAssist).toBe(true);
    m.retry();
    m.send('loaded');
    m.send('reachPass');
    expect(m.shouldOfferAssist).toBe(false);
  });

  it('completes and ignores fail or retry afterwards', () => {
    const { m, log } = setup();
    m.start();
    for (const e of ['loaded', 'reachPass', 'through', 'depart'] as const) m.send(e);
    expect(m.isComplete).toBe(true);
    m.fail('late');
    m.retry();
    expect(m.state).toBe('complete');
    expect(log.at(-1)).toBe('done');
  });

  it('round-trips an exact snapshot', () => {
    const { m, bus } = setup();
    m.start();
    m.send('loaded');
    m.data = { trucks: 3 };
    const snap = m.snapshot();
    const other = new MissionRuntime(convoy, bus);
    other.start(snap);
    expect(other.state).toBe('drive');
    expect(other.checkpoint).toBe('loadTrucks');
    expect(other.data).toEqual({ trucks: 3 });
  });
});

describe('difficulty', () => {
  it('orders levels from easiest to hardest', () => {
    expect(DIFFICULTY.story.timerScale).toBeGreaterThan(DIFFICULTY.normal.timerScale);
    expect(DIFFICULTY.normal.timerScale).toBeGreaterThan(DIFFICULTY.challenge.timerScale);
    expect(DIFFICULTY.story.telegraphSeconds).toBeGreaterThanOrEqual(4);
    expect(DIFFICULTY.challenge.telegraphSeconds).toBeGreaterThanOrEqual(2);
  });

  it('applies the more-time assist without changing other params', () => {
    const p = effectiveParams('normal', { moreTime: true, extraCheckpoint: false });
    expect(p.timerScale).toBeCloseTo(ASSIST_TIMER_BONUS);
    expect(p.resourceScale).toBe(1);
    expect(effectiveParams('normal', { moreTime: false, extraCheckpoint: false })).toBe(DIFFICULTY.normal);
  });
});
