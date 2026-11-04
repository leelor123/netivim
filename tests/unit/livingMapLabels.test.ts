import { describe, expect, it } from 'vitest';
import { LabelCollider, makeTextMeasurer, MAX_LABEL_SHIFT_PX } from '../../src/features/livingMap/labelLayout';

function make(prios: number[], width = 60): LabelCollider {
  const c = new LabelCollider(prios.length, prios);
  c.width.fill(width);
  c.visible.fill(1);
  return c;
}

describe('label collision avoidance', () => {
  it('keeps the higher-priority label where it is and nudges the other to a free offset', () => {
    const c = make([1, 3]);
    c.x.set([100, 110]);
    c.y.set([100, 105]);
    c.resolve();
    expect(Array.from(c.visible)).toEqual([1, 1]);
    // The high-priority label (index 1) did not move; the low-priority one moved clear of it.
    expect(c.x[1]).toBe(110);
    expect(c.y[1]).toBe(105);
    const moved = Math.hypot((c.x[0] as number) - 100, (c.y[0] as number) - 100);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(MAX_LABEL_SHIFT_PX + 30);
    const overlapX = Math.abs((c.x[0] as number) - (c.x[1] as number)) < 60 + c.gap;
    const overlapY = Math.abs((c.y[0] as number) - (c.y[1] as number)) < c.height + c.gap;
    expect(overlapX && overlapY).toBe(false);
  });

  it('keeps separated labels and ignores unprojected ones', () => {
    const c = make([1, 1, 1]);
    c.x.set([50, 300, 52]);
    c.y.set([50, 50, 50]);
    c.visible[2] = 0;
    c.resolve();
    expect(Array.from(c.visible)).toEqual([1, 1, 0]);
    expect(c.x[0]).toBe(50);
    expect(c.x[1]).toBe(300);
  });

  it('is stable on ties (lower index keeps its place) and re-evaluates after movement', () => {
    const c = make([2, 2]);
    c.x.set([100, 100]);
    c.y.set([100, 100]);
    c.resolve();
    expect(c.x[0]).toBe(100);
    expect(c.y[0]).toBe(100);
    expect(c.y[1]).not.toBe(100);
    c.visible.fill(1);
    c.x.set([100, 400]);
    c.y.set([100, 100]);
    c.resolve();
    expect(Array.from(c.visible)).toEqual([1, 1]);
    expect(c.x[1]).toBe(400);
  });

  it('still hides a label when no small offset is free', () => {
    const n = 40;
    const c = make(Array.from({ length: n }, () => 1));
    c.x.fill(200);
    c.y.fill(200);
    c.resolve();
    const shown = Array.from(c.visible).filter((v) => v === 1).length;
    expect(shown).toBeGreaterThan(3);
    expect(shown).toBeLessThan(n);
    // Every shown label stays near its marker.
    for (let i = 0; i < n; i++) {
      if (c.visible[i] === 1) expect(Math.hypot((c.x[i] as number) - 200, (c.y[i] as number) - 200)).toBeLessThanOrEqual(MAX_LABEL_SHIFT_PX + 40);
    }
  });

  it('keeps most labels of a crowded default view visible (was about 3 of 10)', () => {
    // Ten markers of a small country in a 780x360 view: neighbours a few dozen px apart.
    const pts: Array<[number, number, number]> = [
      [380, 90, 3],
      [392, 112, 3],
      [350, 150, 2],
      [370, 168, 2],
      [388, 186, 3],
      [420, 190, 1],
      [360, 215, 2],
      [345, 240, 1],
      [372, 262, 3],
      [398, 285, 2],
    ];
    const c = new LabelCollider(pts.length, pts.map((p) => p[2]));
    pts.forEach((p, i) => {
      c.x[i] = p[0];
      c.y[i] = p[1];
      c.width[i] = 70;
      c.visible[i] = 1;
    });
    c.resolve();
    expect(Array.from(c.visible).filter((v) => v === 1).length).toBeGreaterThanOrEqual(8);
  });
});

describe('text measurement', () => {
  it('falls back to a per-character estimate without a canvas and caches results', () => {
    const measure = makeTextMeasurer('700 14px sans-serif', 7);
    expect(measure('abcd')).toBe(28);
    expect(measure('abcd')).toBe(28);
    expect(measure('')).toBe(0);
  });
});
