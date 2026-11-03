import { CH00_CHAPTER } from '../../content/ch00/chapter';
import { CH00_OPENING_ID } from '../../content/ch00/cutscenes';
import { BRIEFING_KEYS } from '../../content/ch00/dialogue';
import type { ChapterDefinition } from '../../gameplay/types';

/**
 * Prologue chapter module: content from src/content/ch00, two missions in order. The mission
 * decisions are empty (neither Prologue mission presents a Choice Ledger decision).
 */
const chapter: ChapterDefinition = {
  content: CH00_CHAPTER,
  timelineId: 'prologue',
  levels: ['archive-night', 'jaffa-letters'],
  briefingContextKey: BRIEFING_KEYS.chapter.body,
  decisions: [],
  cutsceneId: CH00_OPENING_ID,
};

export default chapter;
