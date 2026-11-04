export type AdaptiveState = 'warmup' | 'ok' | 'struggling' | 'cooldown';

export interface AdaptiveOptions {
  /** Frames in the rolling window. */
  readonly windowSize: number;
  /** A frame "misses" when it takes longer than target x this factor. */
  readonly missFactor: number;
  /** Enter "struggling" at or above this miss ratio... */
  readonly enterRatio: number;
  /** ...and leave it only at or below this one (hysteresis band in between). */
  readonly exitRatio: number;
  /** Struggling must last this long (ms) before a step down. */
  readonly sustainMs: number;
  /** After a step down: ignore everything for this long (ms), then refill the window. */
  readonly cooldownMs: number;
  /** After reset (scene or settings change): shader compiles and uploads are not judged (ms). */
  readonly warmupMs: number;
  /** Grace period after launch, the first-launch benchmark and scene switches (ms, see grace()). */
  readonly graceMs: number;
  /** Frames longer than this are hitches (tab switch, GC, loading), not sustained load. */
  readonly ignoreAboveMs: number;
}

export const DEFAULT_ADAPTIVE: AdaptiveOptions = {
  windowSize: 90,
  missFactor: 1.25,
  enterRatio: 0.3,
  exitRatio: 0.1,
  sustainMs: 3000,
  cooldownMs: 8000,
  warmupMs: 2000,
  graceMs: 8000,
  ignoreAboveMs: 250,
};

/**
 * Decides when quality should step down one level. Pure (no DOM, no three.js) so it is unit
 * tested. It only ever steps down within a session: stepping back up is what makes adaptive
 * systems oscillate, so recovery happens only through an explicit settings change or next launch.
 */
export class AdaptiveQuality {
  private readonly times: Float32Array;
  private head = 0;
  private count = 0;
  private misses = 0;
  private state_: AdaptiveState = 'warmup';
  private stateSince = 0;
  private targetMs = 1000 / 60;
  private started = false;
  private warmupLen = 0;

  constructor(private readonly opts: AdaptiveOptions = DEFAULT_ADAPTIVE) {
    this.times = new Float32Array(opts.windowSize);
  }

  get state(): AdaptiveState {
    return this.state_;
  }

  get missRatio(): number {
    return this.count === 0 ? 0 : this.misses / this.count;
  }

  /** fps 0 (unlocked) is judged against 60. */
  setTargetFps(fps: number): void {
    this.targetMs = 1000 / (fps > 0 ? fps : 60);
  }

  /** Starts a new warm-up (call after any quality, scene or visibility change). */
  reset(nowMs: number): void {
    this.clearWindow();
    this.state_ = 'warmup';
    this.stateSince = nowMs;
    this.warmupLen = this.opts.warmupMs;
    this.started = true;
  }

  /**
   * Starts the long grace period (graceMs) in which no frame is judged and no step down can
   * happen. Call at launch, after the first-launch benchmark and after scene switches, when
   * shader compiles and asset uploads make frames slow without the preset being too high.
   */
  grace(nowMs: number): void {
    if (this.opts.graceMs <= 0) return; // disabled (E2E builds)
    this.reset(nowMs);
    this.warmupLen = Math.max(this.opts.warmupMs, this.opts.graceMs);
  }

  /** Feeds one rendered frame. Returns true exactly when quality should drop one level now. */
  sample(frameMs: number, nowMs: number): boolean {
    if (!this.started) this.reset(nowMs);
    const o = this.opts;
    if (this.state_ === 'warmup') {
      if (nowMs - this.stateSince < this.warmupLen) return false;
      this.enter('ok', nowMs);
    } else if (this.state_ === 'cooldown') {
      if (nowMs - this.stateSince < o.cooldownMs) return false;
      this.enter('ok', nowMs);
    }
    if (!(frameMs > 0) || frameMs > o.ignoreAboveMs) return false;
    this.push(frameMs > this.targetMs * o.missFactor);
    if (this.count < this.times.length) return false;

    const ratio = this.missRatio;
    if (this.state_ === 'ok') {
      if (ratio >= o.enterRatio) this.enter('struggling', nowMs);
      return false;
    }
    // struggling
    if (ratio <= o.exitRatio) {
      this.enter('ok', nowMs);
      return false;
    }
    if (nowMs - this.stateSince >= o.sustainMs) {
      this.enter('cooldown', nowMs);
      this.clearWindow();
      return true;
    }
    return false;
  }

  private enter(s: AdaptiveState, nowMs: number): void {
    this.state_ = s;
    this.stateSince = nowMs;
  }

  private push(miss: boolean): void {
    const v = miss ? 1 : 0;
    if (this.count === this.times.length) this.misses -= this.times[this.head] ?? 0;
    else this.count++;
    this.times[this.head] = v;
    this.misses += v;
    this.head = (this.head + 1) % this.times.length;
  }

  private clearWindow(): void {
    this.times.fill(0);
    this.head = 0;
    this.count = 0;
    this.misses = 0;
  }
}

/** Battery hint (navigator.getBattery): low and discharging suggests Battery Saver. */
export function batterySuggestsSaver(level: number, charging: boolean): boolean {
  return !charging && level <= 0.2;
}
