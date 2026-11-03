import { describe, expect, it } from 'vitest';
import type { DifficultyLevel } from '../../src/core/difficulty';
import { analyzeMission } from '../../src/core/mission';
import { validateDecision } from '../../src/gameplay/core/ledger';
import { levelIds, loadLevel } from '../../src/gameplay/registry';
import { runBot } from '../../src/gameplay/runtime/bot';

/**
 * Solvability harness (BRIEF 9): every registered level must pass the static mission analysis
 * (no softlocks) and the scripted QA bot must complete it from every checkpoint (extra assist
 * checkpoints included) on every difficulty, using the fixed timestep only.
 */

const LEVELS = levelIds();
const DIFFICULTIES: readonly DifficultyLevel[] = ['story', 'normal', 'challenge'];

describe.each(LEVELS)('level %s', (id) => {
  it('has a sound mission machine and complete metadata', async () => {
    const def = await loadLevel(id);
    expect(def.id).toBe(id);
    const analysis = analyzeMission(def.mission);
    expect(analysis.problems).toEqual([]);
    expect(analysis.ok).toBe(true);
    for (const cp of [...def.mission.checkpoints, ...(def.extraCheckpoints ?? [])]) {
      expect(Object.hasOwn(def.botScript, cp), 'bot script for checkpoint ' + cp).toBe(true);
    }
    for (const d of def.decisions ?? []) expect(validateDecision(d)).toEqual([]);
    for (const [reason, info] of Object.entries(def.failures)) {
      expect(info.hintKey, reason).toBeTruthy();
      if (info.label === 'documented') expect(info.sources.length, reason).toBeGreaterThan(0);
    }
  });

  for (const difficulty of DIFFICULTIES) {
    it('bot completes it from every checkpoint on ' + difficulty, async () => {
      const def = await loadLevel(id);
      for (const cp of [...def.mission.checkpoints, ...(def.extraCheckpoints ?? [])]) {
        const r = runBot(def, { difficulty, fromCheckpoint: cp });
        expect(r.failures.map((f) => f.reasonKey), cp + ': ' + r.log.join(' | ')).toEqual([]);
        expect(r.completed, cp + ': ' + r.log.join(' | ')).toBe(true);
      }
    });
  }
});
