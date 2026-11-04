export const FIXED_DT = 1 / 60;

export interface GameLoopOptions {
  /** One fixed simulation step. */
  step(dt: number): void;
  /** Upper bound of steps per frame; extra backlog is dropped (avoids a spiral of death). */
  maxSteps?: number;
  fixedDt?: number;
  /**
   * 'fixed' (default): constant fixedDt steps with an accumulator; deterministic, used by tests
   * and the QA bot. 'frame': each rendered frame advances exactly its real time, split into equal
   * steps of at most fixedDt. The game uses 'frame' so motion is smooth on 60, 90 and 120 Hz
   * displays (a fixed 60 Hz step drawn on a 120 Hz screen alternates 0 and 2 steps per frame,
   * which reads as stuttering walking and camera motion).
   */
  mode?: 'fixed' | 'frame';
}

/**
 * Fixed-timestep accumulator. Pure (no three.js, no DOM) so it can be tested and driven by the
 * QA bot faster than real time. The render side calls advance() once per frame.
 */
export class GameLoop {
  paused = false;
  private accumulator = 0;
  private readonly fixedDt: number;
  private readonly maxSteps: number;

  constructor(private readonly options: GameLoopOptions) {
    this.fixedDt = options.fixedDt ?? FIXED_DT;
    this.maxSteps = options.maxSteps ?? 5;
  }

  /** Advances by real frame time and returns the interpolation alpha in [0, 1). */
  advance(frameSeconds: number): number {
    if (!(frameSeconds > 0) || this.paused) return this.accumulator / this.fixedDt;
    if (this.options.mode === 'frame') {
      // Drop backlog beyond maxSteps after a stall instead of fast-forwarding the world.
      const total = Math.min(frameSeconds, this.maxSteps * this.fixedDt);
      const n = Math.max(1, Math.ceil(total / this.fixedDt - 1e-9));
      const dt = total / n;
      for (let i = 0; i < n; i++) this.options.step(dt);
      return 0;
    }
    this.accumulator += frameSeconds;
    let steps = 0;
    // Small epsilon so float drift (e.g. 2 x 1/120) does not lose a step.
    while (this.accumulator + 1e-9 >= this.fixedDt && steps < this.maxSteps) {
      this.options.step(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps++;
    }
    if (steps === this.maxSteps && this.accumulator >= this.fixedDt) this.accumulator = 0;
    if (this.accumulator < 0) this.accumulator = 0;
    return this.accumulator / this.fixedDt;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
