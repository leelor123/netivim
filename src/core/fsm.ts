export interface MachineDefinition<S extends string, E extends string> {
  readonly initial: S;
  /** States where the machine is finished (e.g. a mission's "complete"). */
  readonly final: readonly S[];
  readonly transitions: { readonly [K in S]: Partial<Record<E, S>> };
}

export interface MachineHooks<S extends string, E extends string> {
  guard?(from: S, to: S, event: E): boolean;
  onExit?(state: S, event: E): void;
  onEnter?(state: S, event: E): void;
  onChange?(from: S, to: S, event: E): void;
  onReject?(state: S, event: E): void;
}

/** Explicit finite state machine: only declared transitions are possible. */
export class Machine<S extends string, E extends string> {
  private current: S;

  constructor(
    private readonly def: MachineDefinition<S, E>,
    private readonly hooks: MachineHooks<S, E> = {},
  ) {
    this.current = def.initial;
  }

  get state(): S {
    return this.current;
  }

  get isFinal(): boolean {
    return this.def.final.includes(this.current);
  }

  can(event: E): boolean {
    return this.def.transitions[this.current][event] !== undefined;
  }

  send(event: E): boolean {
    const from = this.current;
    const to = this.def.transitions[from][event];
    if (to === undefined || (this.hooks.guard && !this.hooks.guard(from, to, event))) {
      this.hooks.onReject?.(from, event);
      return false;
    }
    this.hooks.onExit?.(from, event);
    this.current = to;
    this.hooks.onEnter?.(to, event);
    this.hooks.onChange?.(from, to, event);
    return true;
  }

  /** Jump to a state without hooks, e.g. when loading a save or a checkpoint. */
  restore(state: S): void {
    if (!Object.hasOwn(this.def.transitions, state)) throw new Error('Unknown state: ' + state);
    this.current = state;
  }
}

export interface MachineAnalysis<S extends string> {
  readonly ok: boolean;
  /** States not reachable from the initial state. */
  readonly unreachable: S[];
  /** Non-final states with no outgoing transitions. */
  readonly deadEnds: S[];
  /** Reachable states from which no final state can be reached (softlocks). */
  readonly cannotFinish: S[];
}

/** Graph checks used by the solvability tests: no softlocks, no orphan states. */
export function analyzeMachine<S extends string, E extends string>(def: MachineDefinition<S, E>): MachineAnalysis<S> {
  const states = Object.keys(def.transitions) as S[];
  const edges = (s: S): S[] => Object.values(def.transitions[s]) as S[];

  const reachable = new Set<S>([def.initial]);
  const queue: S[] = [def.initial];
  while (queue.length > 0) {
    const s = queue.shift() as S;
    for (const t of edges(s)) {
      if (!reachable.has(t)) {
        reachable.add(t);
        queue.push(t);
      }
    }
  }

  // Reverse search from the final states.
  const canFinish = new Set<S>(def.final);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of states) {
      if (!canFinish.has(s) && edges(s).some((t) => canFinish.has(t))) {
        canFinish.add(s);
        grew = true;
      }
    }
  }

  const unreachable = states.filter((s) => !reachable.has(s));
  const deadEnds = states.filter((s) => !def.final.includes(s) && edges(s).length === 0);
  const cannotFinish = states.filter((s) => reachable.has(s) && !canFinish.has(s));
  return {
    ok: unreachable.length === 0 && deadEnds.length === 0 && cannotFinish.length === 0,
    unreachable,
    deadEnds,
    cannotFinish,
  };
}
