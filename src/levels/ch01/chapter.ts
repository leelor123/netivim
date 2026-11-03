import { CH01 } from '../../content/ch01/chapter';
import { CH01_CUTSCENES } from '../../content/ch01/cutscenes';
import type { ChapterDefinition } from '../../gameplay/types';
import vote from './the-vote';

/**
 * Chapter 1 "Roots" (1904-1947) as the gameplay framework runs it: the content data, the three
 * levels in mission order and the briefing context text. The chapter ledger lists the decisions
 * of The Vote (Tower and Stockade has none).
 */
const chapter: ChapterDefinition = {
  content: CH01,
  timelineId: 'ch01',
  levels: ['tower-stockade', 'night-landing', 'the-vote'],
  briefingContextKey: 'levels.ch01.tower.context',
  cutscenes: CH01_CUTSCENES,
  cutsceneId: 'ch01.stockade-and-radio',
  decisions: vote.decisions ?? [],
};

export default chapter;
