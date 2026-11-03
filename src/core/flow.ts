import { EventBus } from './events';
import { Machine, type MachineDefinition } from './fsm';
import type { GameEvents } from './gameEvents';

export type FlowState = 'boot' | 'title' | 'hub' | 'briefing' | 'mission' | 'cutscene' | 'debrief' | 'quiz';
export type FlowEvent =
  | 'ready'
  | 'openHub'
  | 'toTitle'
  | 'openBriefing'
  | 'back'
  | 'startMission'
  | 'playCutscene'
  | 'resumeMission'
  | 'missionDone'
  | 'abandon'
  | 'toDebrief'
  | 'toQuiz'
  | 'nextMission'
  | 'toHub';

/** States in which an exit auto-save must not overwrite the last stable save (BRIEF 8.B). */
export const VOLATILE_STATES: ReadonlySet<FlowState> = new Set(['mission', 'cutscene']);

export const FLOW_DEFINITION: MachineDefinition<FlowState, FlowEvent> = {
  initial: 'boot',
  // The flow never ends; every state must be able to get back to the hub.
  final: ['hub'],
  transitions: {
    boot: { ready: 'title' },
    title: { openHub: 'hub' },
    hub: { openBriefing: 'briefing', toTitle: 'title' },
    briefing: { startMission: 'mission', back: 'hub' },
    mission: { playCutscene: 'cutscene', missionDone: 'debrief', abandon: 'hub' },
    cutscene: { resumeMission: 'mission', toDebrief: 'debrief', abandon: 'hub' },
    debrief: { toQuiz: 'quiz', nextMission: 'briefing', toHub: 'hub' },
    quiz: { toHub: 'hub' },
  },
};

/** Top-level game flow: which screen the player is on, plus the pause overlay flag. */
export class GameFlow {
  private readonly machine: Machine<FlowState, FlowEvent>;
  private pausedFlag = false;

  constructor(private readonly bus: EventBus<GameEvents>) {
    this.machine = new Machine(FLOW_DEFINITION, {
      onChange: (from, to) => bus.emit('flow:changed', { from, to }),
    });
  }

  get state(): FlowState {
    return this.machine.state;
  }

  get isVolatile(): boolean {
    return VOLATILE_STATES.has(this.machine.state);
  }

  get paused(): boolean {
    return this.pausedFlag;
  }

  send(event: FlowEvent): boolean {
    const ok = this.machine.send(event);
    // Leaving gameplay always clears pause so menus are never stuck paused.
    if (ok && !this.isVolatile) this.setPaused(false);
    return ok;
  }

  can(event: FlowEvent): boolean {
    return this.machine.can(event);
  }

  setPaused(paused: boolean): void {
    if (paused === this.pausedFlag) return;
    this.pausedFlag = paused;
    this.bus.emit('flow:pause-changed', { paused });
  }

  restore(state: FlowState): void {
    this.machine.restore(state);
  }
}
