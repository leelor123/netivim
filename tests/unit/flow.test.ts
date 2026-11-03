import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/events';
import { analyzeMachine } from '../../src/core/fsm';
import { FLOW_DEFINITION, GameFlow } from '../../src/core/flow';
import type { GameEvents } from '../../src/core/gameEvents';

describe('GameFlow', () => {
  it('can always get back to the hub from every reachable screen', () => {
    const r = analyzeMachine(FLOW_DEFINITION);
    expect(r.unreachable).toEqual([]);
    expect(r.cannotFinish).toEqual([]);
  });

  it('walks the main loop and emits changes', () => {
    const bus = new EventBus<GameEvents>();
    const seen: string[] = [];
    bus.on('flow:changed', ({ to }) => seen.push(to));
    const flow = new GameFlow(bus);
    for (const e of ['ready', 'openHub', 'openBriefing', 'startMission', 'playCutscene', 'toDebrief', 'toQuiz', 'toHub'] as const) {
      expect(flow.send(e)).toBe(true);
    }
    expect(seen).toEqual(['title', 'hub', 'briefing', 'mission', 'cutscene', 'debrief', 'quiz', 'hub']);
  });

  it('marks mission and cutscene as volatile', () => {
    const flow = new GameFlow(new EventBus<GameEvents>());
    flow.restore('hub');
    expect(flow.isVolatile).toBe(false);
    flow.restore('mission');
    expect(flow.isVolatile).toBe(true);
    flow.restore('cutscene');
    expect(flow.isVolatile).toBe(true);
  });

  it('clears pause when leaving gameplay', () => {
    const bus = new EventBus<GameEvents>();
    const pauses: boolean[] = [];
    bus.on('flow:pause-changed', ({ paused }) => pauses.push(paused));
    const flow = new GameFlow(bus);
    flow.restore('mission');
    flow.setPaused(true);
    flow.setPaused(true);
    flow.send('abandon');
    expect(flow.paused).toBe(false);
    expect(pauses).toEqual([true, false]);
  });
});
