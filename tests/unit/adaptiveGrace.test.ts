import { describe, expect, it } from 'vitest';
import { AdaptiveQuality, DEFAULT_ADAPTIVE } from '../../src/render/adaptiveQuality';

describe('AdaptiveQuality grace period (launch, benchmark, scene switch)', () => {
  const o = DEFAULT_ADAPTIVE;
  function run(a: AdaptiveQuality, frameMs: number, durationMs: number, t: number): [number, number] {
    let steps = 0;
    const end = t + durationMs;
    while (t < end) {
      t += frameMs;
      if (a.sample(frameMs, t)) steps++;
    }
    return [steps, t];
  }

  it('never steps down inside the grace period, however slow the frames are', () => {
    const a = new AdaptiveQuality();
    a.grace(0);
    const [steps] = run(a, 30, o.graceMs - 100, 0);
    expect(steps).toBe(0);
    expect(a.state).toBe('warmup');
  });

  it('judges frames again once the grace period is over', () => {
    const a = new AdaptiveQuality();
    a.grace(0);
    const [steps] = run(a, 30, o.graceMs + 2000 + o.sustainMs + 1000, 0);
    expect(steps).toBe(1);
  });

  it('a plain reset keeps the short warm-up, and grace can restart after one', () => {
    const a = new AdaptiveQuality();
    a.grace(0);
    a.reset(100);
    const [, t] = run(a, 16, o.warmupMs + 100, 100);
    expect(a.state).toBe('ok');
    a.grace(t);
    run(a, 30, o.graceMs - 100, t);
    expect(a.state).toBe('warmup');
  });
});
