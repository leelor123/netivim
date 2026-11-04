import type { DifficultyLevel } from '../../core/difficulty';
import { EventBus } from '../../core/events';
import type { GameEvents } from '../../core/gameEvents';
import type { Action, Vec2 } from '../../core/input/types';
import { FIXED_DT } from '../../core/loop';
import { DEFAULT_WORLD_QUALITY } from '../../world/quality';
import type { DecisionDef } from '../core/ledger';
import type { LogisticsModel } from '../modules/logistics';
import { stickToward } from '../core/movement';
import type { AnyLevelDefinition, BotStep, LevelInput } from '../types';
import { MissionHost, type FailureReport } from './missionHost';

/** Scripted input for the QA bot: actions are tapped for exactly one step. */
export class BotInput implements LevelInput {
  readonly move: Vec2 = { x: 0, y: 0 };
  readonly look: Vec2 = { x: 0, y: 0 };
  readonly lookDrag: Vec2 = { x: 0, y: 0 };
  scroll = 0;
  private readonly tapped = new Set<Action>();
  private readonly next = new Set<Action>();

  tap(a: Action): void {
    this.next.add(a);
  }

  /** Called once per step before the simulation reads input. */
  beginStep(): void {
    this.tapped.clear();
    for (const a of this.next) this.tapped.add(a);
    this.next.clear();
  }

  isDown(a: Action): boolean {
    return this.tapped.has(a);
  }

  justPressed(a: Action): boolean {
    return this.tapped.has(a);
  }
}

export interface BotOptions {
  readonly difficulty: DifficultyLevel;
  /** Start at this checkpoint instead of the initial state. */
  readonly fromCheckpoint?: string;
  /** Simulated seconds before the run is declared stuck. */
  readonly maxSeconds?: number;
  /** Retry automatically after a failure (default false: a failure ends the run). */
  readonly retryOnFail?: boolean;
  readonly bus?: EventBus<GameEvents>;
}

export interface BotResult {
  readonly completed: boolean;
  readonly seconds: number;
  readonly steps: number;
  readonly failures: readonly FailureReport[];
  readonly finalState: string;
  readonly log: readonly string[];
  readonly choices: Readonly<Record<string, string>>;
}

/**
 * Drives a level through its botScript with the fixed timestep, as fast as the CPU allows and
 * fully deterministic (no wall clock, no renderer, no DOM). Used by the solvability harness.
 */
export function runBot(def: AnyLevelDefinition, o: BotOptions): BotResult {
  const bus = o.bus ?? new EventBus<GameEvents>();
  const input = new BotInput();
  const log: string[] = [];
  const failures: FailureReport[] = [];
  const choices: Record<string, string> = {};
  const plan: { current: { model: LogisticsModel; confirm: () => void } | null } = { current: null };
  const pending: { current: { def: DecisionDef; choose: (id: string) => void } | null } = { current: null };
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
    recordChoice: (d, opt) => {
      choices[d.id] = opt;
    },
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
        pending.current = { def: d, choose };
      },
      onComplete: () => log.push('complete'),
      onPlan: (model, confirm) => {
        plan.current = { model, confirm };
      },
    },
  });
  const offCp = bus.on('mission:checkpoint', ({ checkpoint }) => {
    log.push('checkpoint: ' + checkpoint);
    restartQueue = true;
  });

  const maxSteps = Math.round((o.maxSeconds ?? 900) / FIXED_DT);
  const stick = { x: 0, y: 0 };
  let queue: BotStep[] = [];
  let stepTime = 0;
  let steps = 0;
  try {
    host.start();
    const script = def.botScript as Readonly<Record<string, readonly BotStep[]>>;
    for (; steps < maxSteps && !stop && host.phase !== 'complete'; steps++) {
      if (restartQueue) {
        restartQueue = false;
        queue = [...(script[host.checkpoint] ?? [])];
        stepTime = 0;
      }
      input.beginStep();
      input.move.x = 0;
      input.move.y = 0;
      const step = queue[0];
      const level = host.level;
      let done = false;
      if (step && level && host.phase !== 'failed') {
        stepTime += FIXED_DT;
        switch (step.kind) {
          case 'walkTo': {
            const p = level.player;
            if (!p) throw new Error('walkTo needs level.player');
            const within = step.within ?? 0.6;
            if (Math.hypot(p.x - step.x, p.z - step.z) <= within) done = true;
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
      host.update(FIXED_DT);
      if (done) {
        queue.shift();
        stepTime = 0;
      }
    }
  } finally {
    offCp();
  }
  const result: BotResult = {
    completed: host.phase === 'complete',
    seconds: steps * FIXED_DT,
    steps,
    failures,
    finalState: host.state,
    log,
    choices,
  };
  host.dispose();
  return result;
}
