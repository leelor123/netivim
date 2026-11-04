import { describe, expect, it } from 'vitest';
import { GameLoop } from '../../src/core/loop';

function run(hz: number, seconds: number): { steps: number; loop: GameLoop } {
  let steps = 0;
  const loop = new GameLoop({ step: () => steps++ });
  const frames = Math.round(hz * seconds);
  for (let i = 0; i < frames; i++) loop.advance(1 / hz);
  return { steps, loop };
}

describe('GameLoop', () => {
  it.each([30, 60, 120, 144])('simulates 60 steps per second at %i Hz', (hz) => {
    const { steps } = run(hz, 2);
    expect(Math.abs(steps - 120)).toBeLessThanOrEqual(1);
  });

  it('clamps steps after a long stall and drops the backlog', () => {
    let steps = 0;
    const loop = new GameLoop({ step: () => steps++, maxSteps: 5 });
    loop.advance(3);
    expect(steps).toBe(5);
    loop.advance(1 / 60);
    expect(steps).toBe(6);
  });

  it('does not step while paused but keeps alpha valid', () => {
    let steps = 0;
    const loop = new GameLoop({ step: () => steps++ });
    loop.paused = true;
    const alpha = loop.advance(0.5);
    expect(steps).toBe(0);
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
  });

  it('returns interpolation alpha in [0, 1)', () => {
    const loop = new GameLoop({ step: () => undefined });
    const alpha = loop.advance(1 / 120);
    expect(alpha).toBeCloseTo(0.5, 5);
  });

  it('ignores negative or NaN deltas', () => {
    let steps = 0;
    const loop = new GameLoop({ step: () => steps++ });
    loop.advance(-1);
    loop.advance(Number.NaN);
    expect(steps).toBe(0);
  });

  it('passes the fixed dt to the step callback', () => {
    const dts: number[] = [];
    const loop = new GameLoop({ step: (dt) => dts.push(dt) });
    loop.advance(1 / 30);
    expect(dts).toEqual([1 / 60, 1 / 60]);
  });
});

describe('GameLoop frame-synced mode (smooth motion on any display rate)', () => {
  it('advances exactly the frame time at 120 Hz: one 1/120 s step per frame', () => {
    const dts: number[] = [];
    const loop = new GameLoop({ step: (dt) => dts.push(dt), mode: 'frame' });
    for (let i = 0; i < 4; i++) loop.advance(1 / 120);
    expect(dts.length).toBe(4);
    for (const dt of dts) expect(dt).toBeCloseTo(1 / 120, 9);
  });

  it('splits long frames into equal steps of at most 1/60 s', () => {
    const dts: number[] = [];
    const loop = new GameLoop({ step: (dt) => dts.push(dt), mode: 'frame' });
    loop.advance(1 / 30);
    expect(dts).toHaveLength(2);
    expect(dts[0]).toBeCloseTo(1 / 60, 9);
    loop.advance(0.025);
    expect(dts).toHaveLength(4);
    expect(dts[2]).toBeCloseTo(0.0125, 9);
  });

  it('never steps more than maxSteps after a stall, and never while paused', () => {
    let total = 0;
    let n = 0;
    const loop = new GameLoop({ step: (dt) => { total += dt; n++; }, mode: 'frame', maxSteps: 5 });
    loop.advance(2);
    expect(n).toBe(5);
    expect(total).toBeCloseTo(5 / 60, 9);
    loop.paused = true;
    loop.advance(1 / 60);
    expect(n).toBe(5);
    loop.paused = false;
    loop.advance(-1);
    loop.advance(Number.NaN);
    expect(n).toBe(5);
  });
});
