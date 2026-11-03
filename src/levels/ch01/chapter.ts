import { getCinematics } from '../../cinematics';
import { CH01 } from '../../content/ch01/chapter';
import { CH01_CUTSCENES } from '../../content/ch01/cutscenes';
import type { ChapterDefinition } from '../../gameplay/types';

/**
 * Chapter 1 "Roots" (1904-1947) as the gameplay framework runs it: the content data, the three
 * levels in mission order and the briefing context text. Decisions of the later missions
 * (The Vote) are added here when that level lands; Tower and Stockade has none.
 */
const chapter: ChapterDefinition = {
  content: CH01,
  timelineId: 'ch01',
  levels: ['tower-stockade', 'night-landing', 'the-vote'],
  briefingContextKey: 'levels.ch01.tower.context',
  cutsceneId: CH01_CUTSCENES[0]?.id ?? 'ch01.stockade-and-radio',
  decisions: [],
};

// The chapter cutscene is registered with the cinematics system once the chapter loads.
for (const def of CH01_CUTSCENES) getCinematics()?.register(def);

export default chapter;
