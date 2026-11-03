/**
 * Pure scrub math for the horizontal timeline. Position p is a float in [0, count - 1]; 0 is the
 * earliest chapter. In a right-to-left layout the earliest chapter sits at the right edge, so
 * "visually right" means "earlier".
 */

export function clampPosition(p: number, count: number): number {
  if (count <= 1 || !Number.isFinite(p)) return 0;
  return Math.min(count - 1, Math.max(0, p));
}

export function nearestIndex(p: number, count: number): number {
  return Math.round(clampPosition(p, count));
}

/** Fraction 0..1 from the start edge (right in RTL) to the end edge. */
export function fractionFromPosition(p: number, count: number): number {
  return count <= 1 ? 0 : clampPosition(p, count) / (count - 1);
}

/** Fraction 0..1 measured from the physical left edge. */
export function leftFractionFromPosition(p: number, count: number, rtl: boolean): number {
  const f = fractionFromPosition(p, count);
  return rtl ? 1 - f : f;
}

/** Pointer x (client coordinates) over the track -> position. */
export function positionFromClientX(clientX: number, left: number, width: number, count: number, rtl: boolean): number {
  if (width <= 0 || count <= 1) return 0;
  const leftFraction = Math.min(1, Math.max(0, (clientX - left) / width));
  const f = rtl ? 1 - leftFraction : leftFraction;
  return f * (count - 1);
}

/** Direction of time for a physical direction: +1 toward later, -1 toward earlier. */
export function timeDirection(physical: 'left' | 'right', rtl: boolean): 1 | -1 {
  // LTR: right = later. RTL: right = earlier.
  const rightIsLater = !rtl;
  return (physical === 'right') === rightIsLater ? 1 : -1;
}

/** D-pad step: move the index by one in the physical direction. */
export function stepIndex(index: number, physical: 'left' | 'right', count: number, rtl: boolean): number {
  return Math.min(count - 1, Math.max(0, index + timeDirection(physical, rtl)));
}

/**
 * Stick scrub: stickX > 0 means the stick points physically right. Returns the new position after
 * dt seconds at `speed` chapters per second for a full deflection (dead zone applied).
 */
export function scrubWithStick(p: number, stickX: number, dt: number, count: number, rtl: boolean, speed = 3, deadZone = 0.15): number {
  const mag = Math.abs(stickX);
  if (mag <= deadZone) return clampPosition(p, count);
  const eased = (mag - deadZone) / (1 - deadZone);
  const dir = timeDirection(stickX > 0 ? 'right' : 'left', rtl);
  return clampPosition(p + dir * eased * speed * dt, count);
}

/** Piecewise-linear year at a position, given one anchor year per node (non-decreasing). */
export function yearAtPosition(p: number, anchors: readonly number[]): number {
  const n = anchors.length;
  if (n === 0) return 0;
  if (n === 1) return anchors[0] ?? 0;
  const c = clampPosition(p, n);
  const i = Math.min(n - 2, Math.floor(c));
  const a = anchors[i] ?? 0;
  const b = anchors[i + 1] ?? a;
  return a + (b - a) * (c - i);
}
