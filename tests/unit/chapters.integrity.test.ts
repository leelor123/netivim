import { describe, expect, it } from 'vitest';
import { CHAPTERS, LEVELS } from '../../src/gameplay/registry';

describe('registered chapters wire up to registered levels', () => {
  for (const [chapterId, load] of Object.entries(CHAPTERS)) {
    it(chapterId + ': every level exists and matches its mission in order', async () => {
      const chapter = await load();
      expect(chapter.levels.length).toBe(chapter.content.missions.length);
      for (const [i, levelId] of chapter.levels.entries()) {
        const loadLevel = (LEVELS as Record<string, (() => Promise<{ missionId: string; chapterId: string }>) | undefined>)[levelId];
        expect(loadLevel, 'level ' + levelId + ' is registered').toBeDefined();
        if (!loadLevel) continue;
        const level = await loadLevel();
        expect(level.missionId, levelId).toBe(chapter.content.missions[i]?.id);
      }
    });
  }
});
