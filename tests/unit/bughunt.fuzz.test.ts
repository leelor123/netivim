import { describe, expect, it } from 'vitest';
import type { DifficultyLevel } from '../../src/core/difficulty';
import type { MissionSnapshot } from '../../src/core/mission';
import { runBot } from '../../src/gameplay/runtime/bot';
import type { AnyLevelDefinition } from '../../src/gameplay/types';
import archive from '../../src/levels/ch00/archive-night';
import jaffa from '../../src/levels/ch00/jaffa-letters';
import tower from '../../src/levels/ch01/tower-stockade';
import landing from '../../src/levels/ch01/night-landing';
import vote from '../../src/levels/ch01/the-vote';

const LEVELS: readonly AnyLevelDefinition[] = [archive, jaffa, tower, landing, vote];
const LEVELS_DIFF: readonly DifficultyLevel[] = ['story', 'normal', 'challenge'];

/** Deep-clones through JSON, exactly like a save file round trip. */
const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('bug hunt: save/restore and retry fuzz', () => {
  for (const def of LEVELS) {
    for (const difficulty of LEVELS_DIFF) {
      // Restores are the slow half of the fuzz: Normal covers the logic, difficulty only scales timers.
      (difficulty === 'normal' || process.env.CI ? it : it.skip)(def.id + ' completes after a manual-save restore at several moments (' + difficulty + ')', () => {
        // Pass 1: record snapshots every 4 seconds of simulated time.
        const snaps: { step: number; qi: number; snap: MissionSnapshot }[] = [];
        const base = runBot(def, {
          difficulty,
          onStep: (host, step, qi) => {
            if (step % 240 === 120 && host.phase === 'running') snaps.push({ step, qi, snap: roundTrip(host.snapshot()) });
          },
        });
        expect(base.completed, base.log.join('\n')).toBe(true);
        expect(snaps.length).toBeGreaterThan(0);
        // Restore every 3rd snapshot into a fresh host and finish the mission from there.
        const bad: string[] = [];
        for (let i = 0; i < snaps.length; i += 3) {
          const s = snaps[i];
          if (!s) continue;
          const r = runBot(def, { difficulty, snapshot: s.snap, startQueueIndex: s.qi, retryOnFail: true, maxSeconds: 900 });
          if (!r.completed) bad.push('restore@' + s.step + ' state=' + s.snap.state + ' -> ' + r.finalState + ' ' + r.log.slice(-4).join(' | '));
        }
        expect(bad, bad.join('\n')).toEqual([]);
      });

      it(def.id + ' completes after a forced retry at several moments (' + difficulty + ')', () => {
        const bad: string[] = [];
        for (const at of [90, 600, 1500, 2600]) {
          let forced = false;
          const r = runBot(def, {
            difficulty,
            retryOnFail: true,
            onStep: (host, step) => {
              if (!forced && step >= at && host.phase === 'running') {
                forced = true;
                host.fail(Object.keys(def.failures)[0] as string);
              }
            },
          });
          if (forced && !r.completed) bad.push('retry@' + at + ' -> ' + r.finalState + ' ' + r.log.slice(-4).join(' | '));
        }
        expect(bad, bad.join('\n')).toEqual([]);
      });
    }
  }
});
