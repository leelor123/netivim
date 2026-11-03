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
