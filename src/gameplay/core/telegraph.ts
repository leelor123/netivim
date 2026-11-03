import type { DifficultyParams } from '../../core/difficulty';

/** DESIGN 3 fairness rule: every threat is telegraphed at least this long (more on Story). */
export const MIN_TELEGRAPH_SECONDS = 2;

/** Warning time a threat must give for the given difficulty parameters. */
export function telegraphSeconds(params: DifficultyParams): number {
  return Math.max(MIN_TELEGRAPH_SECONDS, params.telegraphSeconds);
}

export type TelegraphPhase = 'idle' | 'warning' | 'triggered';

/**
 * Exposure meter: a danger only matters after the player has been warned for the full minimum
 * warning time. While exposed the meter fills at 1/s; when not exposed it drains twice as fast.
 * `level` (0-1) drives visuals (cone color, HUD meter).
 */
export class Telegraph {
  private filled = 0;
  phase: TelegraphPhase = 'idle';

  constructor(private readonly warningSeconds: () => number) {}

  get level(): number {
    return Math.min(1, this.filled / Math.max(1e-6, this.warningSeconds()));
  }

  /** Seconds of continuous exposure so far. */
  get exposure(): number {
    return this.filled;
  }

  reset(): void {
    this.filled = 0;
    this.phase = 'idle';
  }

  /** Returns true on the step the threat triggers. */
  update(dt: number, exposed: boolean): boolean {
    if (this.phase === 'triggered') return false;
    if (exposed) this.filled += dt;
    else this.filled = Math.max(0, this.filled - dt * 2);
    if (this.filled + 1e-9 >= this.warningSeconds()) {
      this.phase = 'triggered';
      return true;
    }
    this.phase = this.filled > 0 ? 'warning' : 'idle';
    return false;
  }
}

export interface ScheduledThreat {
  readonly id: string;
  /** Mission time when the warning starts. */
  readonly warnAt: number;
  /** Mission time when the threat takes effect (always >= warnAt + telegraph). */
  readonly hitAt: number;
}

/**
 * Schedules a timed threat so its warning always comes at least `telegraph` seconds before it
 * hits; if the wanted hit time is too soon it is pushed back, never the warning cut short.
 */
export function scheduleThreat(id: string, now: number, wantedHitAt: number, telegraph: number): ScheduledThreat {
  const warnAt = Math.max(now, wantedHitAt - telegraph);
  return { id, warnAt, hitAt: Math.max(wantedHitAt, warnAt + telegraph) };
}

/** Countdown that follows the difficulty timer scale, also when it changes mid-run. */
export class MissionTimer {
  private fraction = 0;

  constructor(
    readonly baseSeconds: number,
    private readonly scale: () => number,
  ) {}

  get duration(): number {
    return this.baseSeconds * this.scale();
  }

  get remaining(): number {
    return Math.max(0, (1 - this.fraction) * this.duration);
  }

  get expired(): boolean {
    return this.fraction >= 1;
  }

  reset(): void {
    this.fraction = 0;
  }

  /** Returns true on the step the timer runs out. */
  update(dt: number): boolean {
    if (this.fraction >= 1) return false;
    this.fraction = Math.min(1, this.fraction + dt / Math.max(1e-6, this.duration));
    return this.fraction >= 1;
  }
}
