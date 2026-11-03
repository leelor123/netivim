import { describe, expect, it } from 'vitest';
import { ChapterRun } from '../../src/gameplay/core/chapterRun';
import type { ChapterDefinition } from '../../src/gameplay/types';
import prologue from '../../src/levels/ch00/chapter';

describe('between-mission cutscenes', () => {
  it('plays the opening cutscene after the archive tutorial, not after Jaffa', () => {
    const run = new ChapterRun(prologue as ChapterDefinition, 0);
    expect(run.cutsceneAfterCurrent).toBe('ch00.opening');
    expect(run.afterMission(true)).toBe('playCutscene');
    expect(run.afterMission(false)).toBe('missionDone');
    run.index = 1;
    expect(run.cutsceneAfterCurrent).toBeUndefined();
    expect(run.afterMission(true)).toBe('missionDone');
  });

  it('registers the cutscene definitions it uses', () => {
    const ids = (prologue.cutscenes ?? []).map((c) => c.id);
    for (const id of Object.values(prologue.cutsceneAfterLevel ?? {})) expect(ids).toContain(id);
  });
});
