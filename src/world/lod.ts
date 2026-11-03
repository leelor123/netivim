/**
 * Pure LOD logic (no three.js), unit-tested on its own.
 *
 * Levels: 0 is the most detailed. thresholds[i] is the distance at which level i hands over to
 * level i + 1. Hysteresis keeps a chunk sitting on a boundary from flickering between levels.
 */
export function selectLod(distance: number, thresholds: readonly number[], current: number, hysteresis: number): number {
  let level = 0;
  for (let i = 0; i < thresholds.length; i++) {
    const t = thresholds[i] ?? Infinity;
    // Moving to a coarser level needs to pass the line by +h; returning needs -h.
    const edge = i < current ? t - hysteresis : t + hysteresis;
    if (distance > edge) level = i + 1;
    else break;
  }
  return level;
}

/** Base LOD switch distances (meters) at settings lodDistance = 1. */
export const BASE_LOD_THRESHOLDS: readonly number[] = [70, 150];

export function scaledThresholds(lodDistance: number, out: number[], base: readonly number[] = BASE_LOD_THRESHOLDS): number[] {
  out.length = base.length;
  for (let i = 0; i < base.length; i++) out[i] = (base[i] ?? 0) * lodDistance;
  return out;
}

/**
 * Cross-fade between two LOD levels without popping and without holes. During the first half
 * the incoming level dithers in over the still-opaque outgoing level; during the second half the
 * outgoing level dithers out over the now-opaque incoming one. At no time is the surface missing.
 */
export class LodCrossFade {
  /** Level fully shown when not fading (the outgoing level while fading). */
  from: number;
  to: number;
  /** 0-1 progress; 1 means idle. */
  t = 1;

  constructor(
    initial: number,
    readonly duration = 0.6,
  ) {
    this.from = initial;
    this.to = initial;
  }

  get fading(): boolean {
    return this.t < 1;
  }

  /** The level that is (or is becoming) current. */
  get level(): number {
    return this.to;
  }

  /** Requests a level; a request during a fade waits until the fade completes. */
  request(level: number): void {
    if (this.fading || level === this.to) return;
    this.from = this.to;
    this.to = level;
    this.t = this.duration <= 0 ? 1 : 0;
    if (this.t >= 1) this.from = this.to;
  }

  /** Jumps to a level with no fade (first frame, teleports). */
  reset(level: number): void {
    this.from = level;
    this.to = level;
    this.t = 1;
  }

  /** Advances the fade; returns true while fading. */
  update(dt: number): boolean {
    if (!this.fading) return false;
    this.t = Math.min(1, this.t + dt / this.duration);
    if (this.t >= 1) this.from = this.to;
    return this.fading;
  }

  /** Opacity of the incoming level (0-1). */
  get toOpacity(): number {
    return this.fading ? Math.min(1, this.t * 2) : 1;
  }

  /** Opacity of the outgoing level (0-1); 0 when idle. */
  get fromOpacity(): number {
    return this.fading ? Math.min(1, 2 - this.t * 2) : 0;
  }
}
