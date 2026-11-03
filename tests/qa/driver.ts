import { DIFFICULTY, type DifficultyLevel } from '../../src/core/difficulty';
import { EventBus } from '../../src/core/events';
import type { GameEvents } from '../../src/core/gameEvents';
import { FIXED_DT } from '../../src/core/loop';
import { stickToward } from '../../src/gameplay/core/movement';
import type { DecisionDef } from '../../src/gameplay/core/ledger';
import type { LogisticsModel } from '../../src/gameplay/modules/logistics';
import { BotInput } from '../../src/gameplay/runtime/bot';
import { MissionHost, type FailureReport } from '../../src/gameplay/runtime/missionHost';
import type { AnyLevelDefinition, BotStep } from '../../src/gameplay/types';
import { HEBREW } from '../../src/locales';
import { DEFAULT_WORLD_QUALITY } from '../../src/world/quality';

/**
 * QA driver: replays a level with the same scripted bot as the solvability harness, but records
 * what the balance pass needs (checkpoint times, objective coverage, alerts, subtitles, failure
 * cards). It only reads public MissionHost/Level API; the level code is untouched.
 */

/** Words per second a player reads Hebrew dialogue and subtitles (task brief). */
export const READING_WPS = 12;
/** A first-time human is estimated this much slower than the bot on Normal. */
export const HUMAN_FACTOR = 1.5;

export const DIFFICULTIES: readonly DifficultyLevel[] = ['story', 'normal', 'challenge'];

export const wordCount = (text: string): number => text.split(/\s+/).filter((w) => w.length > 0).length;

/** Reading time of a locale key in seconds (the key itself when it is missing, which tests catch). */
export function readSeconds(key: string): number {
  const text = Object.hasOwn(HEBREW, key) ? (HEBREW[key] as string) : key;
  return wordCount(text) / READING_WPS;
}

export interface Subtitle {
  readonly at: number;
  readonly textKey: string;
  readonly durationMs: number;
  /** Seconds a reader needs for the text. */
  readonly readSeconds: number;
}

export interface Probe {
  readonly levelId: string;
  readonly difficulty: DifficultyLevel;
  readonly completed: boolean;
  /** Simulated seconds from the first step to completion. */
  readonly seconds: number;
  /** Mission start plus each checkpoint, with the simulated time it was reached. */
  readonly checkpoints: readonly { readonly checkpoint: string; readonly at: number }[];
  readonly failures: readonly FailureReport[];
  readonly subtitles: readonly Subtitle[];
  /** Steps in which the HUD had no current objective while the mission ran. */
  readonly stepsWithoutObjective: number;
  readonly objectiveKeys: readonly string[];
  readonly decisions: number;
  readonly plans: number;
  /** Highest alert level (0-1) the bot ever caused; must stay below 1 (never seen). */
  readonly maxAlert: number;
  readonly log: readonly string[];
}

export interface DriveOptions {
  readonly difficulty: DifficultyLevel;
  readonly fromCheckpoint?: string;
  readonly maxSeconds?: number;
  /** Replaces the level's bot script (used by probes that deliberately walk into a threat). */
  readonly script?: Readonly<Record<string, readonly BotStep[]>>;
  /** Called once per step before the host updates (probes watch alerts and the clock). */
  readonly onStep?: (info: StepInfo) => void;
  /** Retry automatically after a failure. */
  readonly retryOnFail?: boolean;
}

export interface StepInfo {
  readonly time: number;
  readonly alert: number;
  readonly host: MissionHost;
}

export function drive(def: AnyLevelDefinition, o: DriveOptions): Probe {
  const bus = new EventBus<GameEvents>();
  const input = new BotInput();
  const log: string[] = [];
  const failures: FailureReport[] = [];
  const subtitles: Subtitle[] = [];
  const checkpoints: { checkpoint: string; at: number }[] = [];
  const objectiveKeys: string[] = [];
  const plan: { current: { model: LogisticsModel; confirm: () => void } | null } = { current: null };
  const pending: { current: { def: DecisionDef; choose: (id: string) => void } | null } = { current: null };
  let time = 0;
  let alert = 0;
  let maxAlert = 0;
  let decisions = 0;
  let plans = 0;
  let stop = false;
  let restartQueue = true;

  const host = new MissionHost({
    def,
    bus,
    input,
    difficulty: () => o.difficulty,
    headless: true,
    quality: { ...DEFAULT_WORLD_QUALITY, shadows: false },
    reducedMotion: () => false,
    t: (k) => k,
    glyph: (a) => a,
    recordChoice: () => undefined,
    snapshot: o.fromCheckpoint ? { missionId: def.missionId, state: o.fromCheckpoint, checkpoint: o.fromCheckpoint, data: null } : null,
    hooks: {
      onFailed: (r) => {
        failures.push(r);
        log.push('failed: ' + r.reasonKey + ' at ' + host.checkpoint);
        if (o.retryOnFail) {
          host.retry();
          restartQueue = true;
        } else stop = true;
      },
      onDecision: (d, choose) => {
        decisions++;
        pending.current = { def: d, choose };
      },
      onComplete: () => log.push('complete'),
      onPlan: (model, confirm) => {
        plans++;
        plan.current = { model, confirm };
      },
      onAlert: (v) => {
        alert = v;
        maxAlert = Math.max(maxAlert, v);
      },
    },
  });
  const offs = [
    bus.on('mission:checkpoint', ({ checkpoint }) => {
      log.push('checkpoint: ' + checkpoint);
      checkpoints.push({ checkpoint, at: time });
      restartQueue = true;
    }),
    bus.on('mission:objective', ({ objectiveKey }) => objectiveKeys.push(objectiveKey)),
    bus.on('subtitle:show', (s) => subtitles.push({ at: time, textKey: s.textKey, durationMs: s.durationMs, readSeconds: readSeconds(s.textKey) })),
  ];

  const maxSteps = Math.round((o.maxSeconds ?? 1800) / FIXED_DT);
  const script = (o.script ?? def.botScript) as Readonly<Record<string, readonly BotStep[]>>;
  const stick = { x: 0, y: 0 };
  let queue: BotStep[] = [];
  let stepTime = 0;
  let steps = 0;
  let noObjective = 0;
  try {
    host.start();
    checkpoints.push({ checkpoint: host.checkpoint, at: 0 });
    for (; steps < maxSteps && !stop && host.phase !== 'complete'; steps++) {
      time = steps * FIXED_DT;
      if (restartQueue) {
        restartQueue = false;
        queue = [...(script[host.checkpoint] ?? [])];
        stepTime = 0;
      }
      input.beginStep();
      input.move.x = 0;
      input.move.y = 0;
      if (host.phase === 'running' && host.objectives.current === null) noObjective++;
      const step = queue[0];
      const level = host.level;
      let done = false;
      if (step && level && host.phase !== 'failed') {
        stepTime += FIXED_DT;
        switch (step.kind) {
          case 'walkTo': {
            const p = level.player;
            if (!p) throw new Error('walkTo needs level.player');
            if (Math.hypot(p.x - step.x, p.z - step.z) <= (step.within ?? 0.6)) done = true;
            else {
              stickToward(p.x, p.z, step.x, step.z, p.cameraYaw, stick);
              input.move.x = stick.x;
              input.move.y = stick.y;
              if (stepTime > (step.timeout ?? 60)) {
                log.push('stuck walking to ' + String(step.x) + ',' + String(step.z));
                stop = true;
              }
            }
            break;
          }
          case 'press':
            input.tap(step.action);
            input.beginStep();
            done = true;
            break;
          case 'wait':
            done = stepTime >= step.seconds;
            break;
          case 'waitFor':
            done = host.state === step.state;
            if (!done && stepTime > (step.timeout ?? 120)) {
              log.push('timeout waiting for ' + step.state);
              stop = true;
            }
            break;
          case 'choose': {
            const p = pending.current;
            if (p) {
              pending.current = null;
              p.choose(step.optionId);
              done = true;
            } else if (stepTime > 30) {
              log.push('no decision to choose ' + step.optionId);
              stop = true;
            }
            break;
          }
          case 'plan': {
            const p = plan.current;
            if (p) {
              plan.current = null;
              if (!p.model.solveGreedy()) {
                log.push('planner has no solution');
                stop = true;
              } else p.confirm();
              done = true;
            } else if (stepTime > 30) {
              log.push('no planner open');
              stop = true;
            }
            break;
          }
          case 'do':
            step.run(level);
            done = true;
            break;
        }
      }
      o.onStep?.({ time, alert, host });
      host.update(FIXED_DT);
      if (done) {
        queue.shift();
        stepTime = 0;
      }
    }
  } finally {
    for (const off of offs) off();
  }
  const probe: Probe = {
    levelId: def.id,
    difficulty: o.difficulty,
    completed: host.phase === 'complete',
    seconds: steps * FIXED_DT,
    checkpoints,
    failures,
    subtitles,
    stepsWithoutObjective: noObjective,
    objectiveKeys,
    decisions,
    plans,
    maxAlert,
    log,
  };
  host.dispose();
  return probe;
}

/** Gaps between consecutive checkpoints plus the tail to completion (seconds). */
export function checkpointGaps(p: Probe): number[] {
  const out: number[] = [];
  for (let i = 1; i < p.checkpoints.length; i++) out.push((p.checkpoints[i] as { at: number }).at - (p.checkpoints[i - 1] as { at: number }).at);
  const last = p.checkpoints[p.checkpoints.length - 1];
  if (last) out.push(p.seconds - last.at);
  return out;
}

export const minutes = (s: number): string => (s / 60).toFixed(1);
export { DIFFICULTY };

/** Builds a started, headless host (no bot): used to exercise failure, retry and assist rules. */
export function startHost(def: AnyLevelDefinition, difficulty: DifficultyLevel): { host: MissionHost; reports: FailureReport[] } {
  const reports: FailureReport[] = [];
  const host = new MissionHost({
    def,
    bus: new EventBus<GameEvents>(),
    input: new BotInput(),
    difficulty: () => difficulty,
    headless: true,
    quality: { ...DEFAULT_WORLD_QUALITY, shadows: false },
    reducedMotion: () => false,
    t: (k) => k,
    glyph: (a) => a,
    recordChoice: () => undefined,
    hooks: {
      onFailed: (r) => reports.push(r),
      onDecision: () => undefined,
      onComplete: () => undefined,
      onPlan: () => undefined,
    },
  });
  host.start();
  return { host, reports };
}
