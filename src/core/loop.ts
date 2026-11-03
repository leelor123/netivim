export const FIXED_DT = 1 / 60;

export interface GameLoopOptions {
  /** One fixed simulation step. */
  step(dt: number): void;
  /** Upper bound of steps per frame; extra backlog is dropped (avoids a spiral of death). */
  maxSteps?: number;
  fixedDt?: number;
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
