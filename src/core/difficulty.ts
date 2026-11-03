export type DifficultyLevel = 'story' | 'normal' | 'challenge';

export interface DifficultyParams {
  /** Multiplier for mission timers (more time is easier). */
  readonly timerScale: number;
  /** Seconds a threat is telegraphed before it matters. */
  readonly telegraphSeconds: number;
  /** Multiplier for supplies and other resources. */
  readonly resourceScale: number;
  /** Seconds before a hint is offered when the player seems stuck. */
  readonly hintDelaySeconds: number;
}

export const DIFFICULTY: Readonly<Record<DifficultyLevel, DifficultyParams>> = {
  story: { timerScale: 1.6, telegraphSeconds: 4, resourceScale: 1.5, hintDelaySeconds: 30 },
  normal: { timerScale: 1, telegraphSeconds: 2.5, resourceScale: 1, hintDelaySeconds: 75 },
  challenge: { timerScale: 0.8, telegraphSeconds: 2, resourceScale: 0.8, hintDelaySeconds: 150 },
};

/** Assists are offered (never forced) after repeated failures at the same checkpoint. */
export type AssistOption = 'hint' | 'moreTime' | 'extraCheckpoint';
export const ASSIST_AFTER_FAILURES = 2;
export const ASSIST_TIMER_BONUS = 1.3;

export interface ActiveAssists {
  readonly moreTime: boolean;
  readonly extraCheckpoint: boolean;
}

/** Final parameters for a mission given the chosen level and any accepted assists. */
export function effectiveParams(level: DifficultyLevel, assists: ActiveAssists): DifficultyParams {
  const base = DIFFICULTY[level];
  return assists.moreTime ? { ...base, timerScale: base.timerScale * ASSIST_TIMER_BONUS } : base;
}
