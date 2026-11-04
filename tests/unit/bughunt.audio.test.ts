import { describe, expect, it } from 'vitest';
import { BEDS, CUES } from '../../src/audio/cues';
import { EventBus } from '../../src/core/events';
import type { GameEvents } from '../../src/core/gameEvents';
import { runBot } from '../../src/gameplay/runtime/bot';
import type { AnyLevelDefinition } from '../../src/gameplay/types';
import archive from '../../src/levels/ch00/archive-night';
import jaffa from '../../src/levels/ch00/jaffa-letters';
import tower from '../../src/levels/ch01/tower-stockade';
import landing from '../../src/levels/ch01/night-landing';
import vote from '../../src/levels/ch01/the-vote';

const LEVELS: readonly AnyLevelDefinition[] = [archive, jaffa, tower, landing, vote];

describe('bug hunt: leaving a level silences its sustained audio', () => {
  for (const def of LEVELS) {
    it(def.id + ': after dispose no ambience bed and no sustained loop is left running', () => {
      const bus = new EventBus<GameEvents>();
      let bed = 'none';
      const loops = new Map<string, number>();
      bus.on('audio:cue', ({ cue, intensity }) => {
        if (cue.startsWith('ambience.')) bed = cue.slice('ambience.'.length);
        else if (CUES[cue]?.kind === 'loop') loops.set(cue, intensity ?? 1);
      });
      // Stop mid-mission (the player exits to the hub), like the director does.
      const r = runBot(def, { difficulty: 'story', bus, maxSeconds: 20 });
      expect(r.steps).toBeGreaterThan(0);
      expect(bed, 'ambience bed still on after dispose').toBe('none');
      const running = [...loops].filter(([, v]) => v > 0).map(([k]) => k);
      expect(running, 'loops still on after dispose').toEqual([]);
    });
  }

  for (const def of LEVELS) {
    it(def.id + ': every cue it emits during a full run exists in the audio library', () => {
      const bus = new EventBus<GameEvents>();
      const unknown = new Set<string>();
      bus.on('audio:cue', ({ cue }) => {
        if (cue.startsWith('ambience.')) {
          const name = cue.slice('ambience.'.length);
          if (name !== 'none' && !BEDS[name]) unknown.add(cue);
        } else if (!CUES[cue]) unknown.add(cue);
      });
      const r = runBot(def, { difficulty: 'normal', bus });
      expect(r.completed).toBe(true);
      expect([...unknown]).toEqual([]);
    });
  }
});
