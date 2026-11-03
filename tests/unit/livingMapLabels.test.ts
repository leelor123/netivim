import { describe, expect, it } from 'vitest';
import { LabelCollider } from '../../src/features/livingMap/labelLayout';

function make(prios: number[]): LabelCollider {
  const c = new LabelCollider(prios.length, prios);
  c.width.fill(60);
  c.visible.fill(1);
  return c;
}

describe('label collision avoidance', () => {
  it('keeps the higher-priority label of an overlapping pair', () => {
    const c = make([1, 3]);
    c.x.set([100, 110]);
    c.y.set([100, 105]);
    c.resolve();
    expect(Array.from(c.visible)).toEqual([0, 1]);
  });

  it('keeps separated labels and ignores unprojected ones', () => {
    const c = make([1, 1, 1]);
    c.x.set([50, 300, 52]);
    c.y.set([50, 50, 50]);
    c.visible[2] = 0;
    c.resolve();
    expect(Array.from(c.visible)).toEqual([1, 1, 0]);
  });

  it('is stable on ties (lower index wins) and re-evaluates after movement', () => {
    const c = make([2, 2]);
    c.x.set([100, 100]);
    c.y.set([100, 100]);
    c.resolve();
    expect(Array.from(c.visible)).toEqual([1, 0]);
    c.visible.fill(1);
    c.x[1] = 400;
    c.resolve();
    expect(Array.from(c.visible)).toEqual([1, 1]);
  });

  it('does not hide a label that overlaps only a hidden one', () => {
    const c = make([3, 2, 1]);
    c.x.set([100, 140, 180]);
    c.y.fill(100);
    c.resolve();
    expect(Array.from(c.visible)).toEqual([1, 0, 1]);
  });
});
