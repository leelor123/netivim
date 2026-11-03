import { describe, expect, it } from 'vitest';
import { Machine, analyzeMachine, type MachineDefinition } from '../../src/core/fsm';

type S = 'idle' | 'running' | 'done' | 'failed';
type E = 'start' | 'finish' | 'fail' | 'retry';

const def: MachineDefinition<S, E> = {
  initial: 'idle',
  final: ['done'],
  transitions: {
    idle: { start: 'running' },
    running: { finish: 'done', fail: 'failed' },
    failed: { retry: 'running' },
    done: {},
  },
};

describe('Machine', () => {
  it('follows declared transitions and reports changes', () => {
    const seen: string[] = [];
    const m = new Machine(def, { onChange: (from, to, ev) => seen.push(from + '>' + to + ':' + ev) });
    expect(m.state).toBe('idle');
    expect(m.send('start')).toBe(true);
    expect(m.send('fail')).toBe(true);
    expect(m.send('retry')).toBe(true);
    expect(m.send('finish')).toBe(true);
    expect(m.state).toBe('done');
    expect(m.isFinal).toBe(true);
    expect(seen).toEqual(['idle>running:start', 'running>failed:fail', 'failed>running:retry', 'running>done:finish']);
  });

  it('rejects undeclared transitions without changing state', () => {
    const rejected: string[] = [];
    const m = new Machine(def, { onReject: (s, e) => rejected.push(s + ':' + e) });
    expect(m.send('finish')).toBe(false);
    expect(m.state).toBe('idle');
    expect(rejected).toEqual(['idle:finish']);
  });

  it('respects guards', () => {
    let allowed = false;
    const m = new Machine(def, { guard: (_from, _to, ev) => ev !== 'start' || allowed });
    expect(m.send('start')).toBe(false);
    allowed = true;
    expect(m.send('start')).toBe(true);
  });

  it('runs exit before enter hooks', () => {
    const order: string[] = [];
    const m = new Machine(def, {
      onExit: (s) => order.push('exit:' + s),
      onEnter: (s) => order.push('enter:' + s),
    });
    m.send('start');
    expect(order).toEqual(['exit:idle', 'enter:running']);
  });

  it('can be restored to a known state', () => {
    const m = new Machine(def);
    m.restore('failed');
    expect(m.state).toBe('failed');
    expect(() => m.restore('nope' as S)).toThrow();
  });
});

describe('analyzeMachine', () => {
  it('passes a well-formed machine', () => {
    const r = analyzeMachine(def);
    expect(r.unreachable).toEqual([]);
    expect(r.deadEnds).toEqual([]);
    expect(r.cannotFinish).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('finds unreachable states, dead ends and states that cannot finish', () => {
    type S2 = 'a' | 'b' | 'trap' | 'island' | 'end';
    const bad: MachineDefinition<S2, 'go' | 'fall'> = {
      initial: 'a',
      final: ['end'],
      transitions: { a: { go: 'b', fall: 'trap' }, b: { go: 'end' }, trap: {}, island: { go: 'end' }, end: {} },
    };
    const r = analyzeMachine(bad);
    expect(r.unreachable).toEqual(['island']);
    expect(r.deadEnds).toEqual(['trap']);
    expect(r.cannotFinish).toEqual(['trap']);
    expect(r.ok).toBe(false);
  });
});
