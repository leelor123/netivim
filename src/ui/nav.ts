/**
 * Pure spatial-navigation math for the FocusManager (no DOM, unit tested).
 *
 * Boxes are in physical screen coordinates, so "left" always means visually left. RTL only
 * changes reading order: the first item, tie-breaks, and which way tab bumpers move.
 */
export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const EPS = 1;

/** Gap between two intervals on one axis (0 when they overlap). */
function gap(a0: number, a1: number, b0: number, b1: number): number {
  if (b1 < a0) return a0 - b1;
  if (b0 > a1) return b0 - a1;
  return 0;
}

/** Negative when a comes before b in reading order (top to bottom, then start to end). */
export function readingCompare(a: Box, b: Box, rtl: boolean): number {
  const ay = a.top + a.height / 2;
  const by = b.top + b.height / 2;
  // Same visual row when the centers are within half the smaller height.
  if (Math.abs(ay - by) > Math.min(a.height, b.height) / 2) return ay - by;
  const ax = a.left + a.width / 2;
  const bx = b.left + b.width / 2;
  return rtl ? bx - ax : ax - bx;
}

/** Index of the first box in reading order, or -1 for an empty list. */
export function firstInReadingOrder(boxes: readonly Box[], rtl: boolean): number {
  let best = -1;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const cur = best >= 0 ? boxes[best] : undefined;
    if (b && (!cur || readingCompare(b, cur, rtl) < 0)) best = i;
  }
  return best;
}

/**
 * Picks the best neighbour of `from` in direction `dir`. Returns its index in `boxes`, or -1.
 * Vertical moves wrap to the other end of the same column when nothing is beyond; horizontal
 * moves never wrap (rows of controls would otherwise jump unexpectedly).
 */
export function findNext(from: Box, boxes: readonly Box[], dir: Dir, rtl: boolean, wrap = true): number {
  const fx = from.left + from.width / 2;
  const fy = from.top + from.height / 2;
  const vertical = dir === 'up' || dir === 'down';
  const sign = dir === 'down' || dir === 'right' ? 1 : -1;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!b || b === from) continue;
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    const along = vertical ? (cy - fy) * sign : (cx - fx) * sign;
    if (along <= EPS) continue;
    const edge = vertical
      ? Math.max(0, sign > 0 ? b.top - (from.top + from.height) : from.top - (b.top + b.height))
      : Math.max(0, sign > 0 ? b.left - (from.left + from.width) : from.left - (b.left + b.width));
    const side = vertical
      ? gap(from.left, from.left + from.width, b.left, b.left + b.width)
      : gap(from.top, from.top + from.height, b.top, b.top + b.height);
    const centerSide = vertical ? Math.abs(cx - fx) : Math.abs(cy - fy);
    const score = edge + along * 0.01 + side * 3 + centerSide * 0.05;
    const cur = best >= 0 ? boxes[best] : undefined;
    if (score < bestScore - 0.001 || (Math.abs(score - bestScore) <= 0.001 && cur && readingCompare(b, cur, rtl) < 0)) {
      best = i;
      bestScore = score;
    }
  }
  if (best >= 0 || !wrap || !vertical) return best;

  // Wrap: the box furthest in the opposite direction, preferring the same column.
  let wrapScore = Infinity;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!b || b === from) continue;
    const cy = b.top + b.height / 2;
    const side = gap(from.left, from.left + from.width, b.left, b.left + b.width);
    // Going down past the end lands on the top-most box (smallest y), and vice versa.
    const score = side * 1000 + cy * sign;
    const cur = best >= 0 ? boxes[best] : undefined;
    if (score < wrapScore - 0.001 || (Math.abs(score - wrapScore) <= 0.001 && cur && readingCompare(b, cur, rtl) < 0)) {
      best = i;
      wrapScore = score;
    }
  }
  return best;
}

/**
 * Tab bumpers move physically: LB selects the tab to the visual left, RB to the right. In RTL
 * reading order runs right to left, so LB means the next tab and RB the previous one.
 */
export function tabDelta(action: 'tabPrev' | 'tabNext', rtl: boolean): -1 | 1 {
  const physicalRight = action === 'tabNext';
  if (rtl) return physicalRight ? -1 : 1;
  return physicalRight ? 1 : -1;
}

/** Logical step (+1 more / next, -1 less / previous) for a horizontal press on a control. */
export function horizontalDelta(dir: 'left' | 'right', rtl: boolean): -1 | 1 {
  // Controls fill in reading direction: in RTL "more" grows towards the left.
  if (rtl) return dir === 'left' ? 1 : -1;
  return dir === 'right' ? 1 : -1;
}
