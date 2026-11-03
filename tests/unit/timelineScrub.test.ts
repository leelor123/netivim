import { describe, expect, it } from 'vitest';
import {
  clampPosition,
  fractionFromPosition,
  leftFractionFromPosition,
  nearestIndex,
  positionFromClientX,
  scrubWithStick,
  stepIndex,
  timeDirection,
  yearAtPosition,
} from '../../src/features/timeline/scrub';

const N = 13;

describe('timeline scrub math', () => {
  it('clamps and rounds positions', () => {
    expect(clampPosition(-3, N)).toBe(0);
    expect(clampPosition(99, N)).toBe(N - 1);
    expect(clampPosition(Number.NaN, N)).toBe(0);
    expect(nearestIndex(2.4, N)).toBe(2);
    expect(nearestIndex(2.6, N)).toBe(3);
    expect(clampPosition(5, 1)).toBe(0);
  });

  it('time runs right to left in RTL', () => {
    expect(timeDirection('left', true)).toBe(1);
    expect(timeDirection('right', true)).toBe(-1);
    expect(timeDirection('right', false)).toBe(1);
    expect(timeDirection('left', false)).toBe(-1);
    expect(stepIndex(3, 'left', N, true)).toBe(4);
    expect(stepIndex(3, 'right', N, true)).toBe(2);
    expect(stepIndex(0, 'right', N, true)).toBe(0);
    expect(stepIndex(N - 1, 'left', N, true)).toBe(N - 1);
  });

  it('puts the first chapter at the right edge in RTL', () => {
    expect(leftFractionFromPosition(0, N, true)).toBe(1);
    expect(leftFractionFromPosition(N - 1, N, true)).toBe(0);
    expect(leftFractionFromPosition(0, N, false)).toBe(0);
    expect(fractionFromPosition(6, N)).toBe(0.5);
  });

  it('maps pointer x to a position in both directions', () => {
    expect(positionFromClientX(100, 0, 100, N, true)).toBeCloseTo(0);
    expect(positionFromClientX(0, 0, 100, N, true)).toBeCloseTo(N - 1);
    expect(positionFromClientX(50, 0, 100, N, true)).toBeCloseTo((N - 1) / 2);
    expect(positionFromClientX(0, 0, 100, N, false)).toBeCloseTo(0);
    expect(positionFromClientX(-40, 0, 100, N, false)).toBeCloseTo(0);
    expect(positionFromClientX(500, 0, 100, N, false)).toBeCloseTo(N - 1);
    expect(positionFromClientX(10, 0, 0, N, true)).toBe(0);
  });

  it('round-trips position and pointer x', () => {
    for (const p of [0, 1.5, 6, 11.25, 12]) {
      const left = leftFractionFromPosition(p, N, true) * 200 + 40;
      expect(positionFromClientX(left, 40, 200, N, true)).toBeCloseTo(p, 6);
    }
  });

  it('left stick scrubs with a dead zone, in time direction', () => {
    expect(scrubWithStick(3, 0.1, 0.1, N, true)).toBe(3);
    const later = scrubWithStick(3, -1, 0.1, N, true);
    expect(later).toBeGreaterThan(3);
    const earlier = scrubWithStick(3, 1, 0.1, N, true);
    expect(earlier).toBeLessThan(3);
    expect(scrubWithStick(3, 1, 0.1, N, false)).toBeGreaterThan(3);
    expect(scrubWithStick(0, 1, 1, N, true)).toBe(0);
    expect(scrubWithStick(N - 1, -1, 1, N, true)).toBe(N - 1);
  });

  it('interpolates years between anchors', () => {
    const anchors = [1900, 1950, 1960];
    expect(yearAtPosition(0, anchors)).toBe(1900);
    expect(yearAtPosition(0.5, anchors)).toBe(1925);
    expect(yearAtPosition(1, anchors)).toBe(1950);
    expect(yearAtPosition(1.5, anchors)).toBe(1955);
    expect(yearAtPosition(9, anchors)).toBe(1960);
    expect(yearAtPosition(0, [])).toBe(0);
  });
});
