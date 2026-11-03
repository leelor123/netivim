import { analyzeMachine, Machine, type MachineAnalysis, type MachineDefinition } from './fsm';
import type { EventBus } from './events';
import type { GameEvents } from './gameEvents';
import { ASSIST_AFTER_FAILURES } from './difficulty';

export type GameplayType = 'EXP' | 'STL' | 'CNV' | 'HLD' | 'LOG' | 'DEC' | 'PZL' | 'PLN' | 'RSC' | 'INT';

/** Every mission machine has these two reserved states. */
export type ReservedState = 'complete' | 'failed';

export interface MissionDefinition<S extends string, E extends string> {
  readonly id: string;
  readonly chapterId: string;
  readonly gameplayType: GameplayType;
  /** Must include 'complete' (final) and 'failed'. Retry from 'failed' is implicit. */
  readonly machine: MachineDefinition<S | ReservedState, E>;
  /** States that act as checkpoints; the initial state must be one of them. */
  readonly checkpoints: readonly S[];
}

/** Snapshot of a running mission, stored only by an explicit manual save (BRIEF 8.C). */
export interface MissionSnapshot {
  readonly missionId: string;
  readonly state: string;
  readonly checkpoint: string;
  readonly data: unknown;
}

export type MissionAnalysis<S extends string> = MachineAnalysis<S | ReservedState> & { readonly problems: string[] };

/**
 * Solvability: the machine is checked with the implicit retry edges from 'failed' to every
 * checkpoint, so a mission passes only if every reachable state can still reach 'complete'.
 */
export function analyzeMission<S extends string, E extends string>(def: MissionDefinition<S, E>): MissionAnalysis<S> {
  type All = S | ReservedState;
  const problems: string[] = [];
  const t = def.machine.transitions as Record<All, Partial<Record<string, All>>>;
  if (!Object.hasOwn(t, 'complete')) problems.push('missing state: complete');
  if (!Object.hasOwn(t, 'failed')) problems.push('missing state: failed');
  if (!def.machine.final.includes('complete')) problems.push('complete must be final');
  if (!def.checkpoints.includes(def.machine.initial as S)) problems.push('initial state must be a checkpoint');
  for (const c of def.checkpoints) if (!Object.hasOwn(t, c)) problems.push('unknown checkpoint: ' + c);

  const retryEdges: Partial<Record<string, All>> = {};
  def.checkpoints.forEach((c, i) => {
    retryEdges['retry' + String(i)] = c;
  });
  // 'failed' is entered at runtime via fail(), so make it reachable from the start only.
  // Stuck states are NOT given a fail edge: a state the player cannot leave by playing is a
  // softlock even though the pause menu could restart the checkpoint.
  const initial = def.machine.initial;
  const transitions = { ...t } as Record<All, Partial<Record<string, All>>>;
  transitions[initial] = { ...t[initial], ['enterFailed']: 'failed' as All };
  transitions.failed = { ...t.failed, ...retryEdges };
  const augmented: MachineDefinition<All, string> = {
    initial: def.machine.initial,
    final: def.machine.final,
    transitions: transitions as MachineDefinition<All, string>['transitions'],
  };
  const analysis = analyzeMachine(augmented);
  return { ...analysis, ok: analysis.ok && problems.length === 0, problems };
}

/**
 * Runs one mission: transitions, in-memory checkpoints (BRIEF 8.F: never written to storage),
 * failure counting per checkpoint and the adaptive-assist offer.
 */
export class MissionRuntime<S extends string, E extends string> {
  private readonly machine: Machine<S | ReservedState, E>;
  private lastCheckpoint: S;
  private readonly failures = new Map<string, number>();
  data: unknown = null;

  constructor(
    readonly def: MissionDefinition<S, E>,
    private readonly bus: EventBus<GameEvents>,
  ) {
    this.lastCheckpoint = def.machine.initial as S;
    this.machine = new Machine(def.machine, {
      onEnter: (state) => this.onEnter(state),
    });
  }

  get state(): S | ReservedState {
    return this.machine.state;
  }

  get checkpoint(): S {
    return this.lastCheckpoint;
  }

  get isComplete(): boolean {
    return this.machine.state === 'complete';
  }

  /** Starts at the initial state, or resumes at an exact snapshot from a manual save. */
  start(snapshot?: MissionSnapshot): void {
    if (snapshot && snapshot.missionId === this.def.id) {
      this.machine.restore(snapshot.state as S);
      this.lastCheckpoint = snapshot.checkpoint as S;
      this.data = snapshot.data;
    } else {
      this.machine.restore(this.def.machine.initial);
      this.lastCheckpoint = this.def.machine.initial as S;
      this.data = null;
    }
    this.bus.emit('mission:started', { missionId: this.def.id, checkpoint: this.lastCheckpoint });
  }

  send(event: E): boolean {
    return this.machine.send(event);
  }

  fail(reasonKey: string): void {
    if (this.isComplete) return;
    const n = (this.failures.get(this.lastCheckpoint) ?? 0) + 1;
    this.failures.set(this.lastCheckpoint, n);
    this.machine.restore('failed');
    this.bus.emit('mission:failed', { missionId: this.def.id, checkpoint: this.lastCheckpoint, reasonKey, failures: n });
  }

  /** Instant retry from the last checkpoint; always available while not complete. */
  retry(): void {
    if (this.isComplete) return;
    this.machine.restore(this.lastCheckpoint);
    this.bus.emit('mission:checkpoint', { missionId: this.def.id, checkpoint: this.lastCheckpoint });
  }

  failuresAtCheckpoint(): number {
    return this.failures.get(this.lastCheckpoint) ?? 0;
  }

  get shouldOfferAssist(): boolean {
    return this.failuresAtCheckpoint() >= ASSIST_AFTER_FAILURES;
  }

  snapshot(): MissionSnapshot {
    return { missionId: this.def.id, state: this.machine.state, checkpoint: this.lastCheckpoint, data: this.data };
  }

  private onEnter(state: S | ReservedState): void {
    if (state === 'complete') {
      this.bus.emit('mission:completed', { missionId: this.def.id, medals: [] });
    } else if (state !== 'failed' && (this.def.checkpoints as readonly string[]).includes(state)) {
      this.lastCheckpoint = state as S;
      this.bus.emit('mission:checkpoint', { missionId: this.def.id, checkpoint: state });
    }
  }
}
