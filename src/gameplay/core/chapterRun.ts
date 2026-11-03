import type { FlowEvent } from '../../core/flow';
import type { MissionMeta } from '../../content/schema';
import type { ChapterDefinition } from '../types';

/**
 * Pure chapter flow (BRIEF 4): content note -> briefing -> missions in order -> cutscene ->
 * debrief (Choice Ledger) -> quiz -> hub. The director turns these answers into flow events and
 * screens; tests drive it against the real GameFlow.
 */
export class ChapterRun {
  index: number;

  constructor(
    readonly chapter: ChapterDefinition,
    startIndex = 0,
  ) {
    if (chapter.levels.length !== chapter.content.missions.length) throw new Error('Chapter ' + chapter.content.id + ': levels and missions differ in length');
    if (chapter.levels.length === 0) throw new Error('Chapter ' + chapter.content.id + ' has no missions');
    this.index = Math.min(Math.max(0, startIndex), chapter.levels.length - 1);
  }

  get mission(): MissionMeta {
    return this.chapter.content.missions[this.index] as MissionMeta;
  }

  get levelId(): string {
    return this.chapter.levels[this.index] as string;
  }

  get isLastMission(): boolean {
    return this.index >= this.chapter.levels.length - 1;
  }

  /** First screen after picking the chapter. */
  get needsContentNote(): boolean {
    return this.chapter.content.contentNote;
  }

  /** Cutscene to play after the current mission: the chapter cutscene after the last one, else a between-missions cutscene. */
  get cutsceneAfterCurrent(): string | undefined {
    if (this.isLastMission) return this.chapter.cutsceneId;
    return this.chapter.cutsceneAfterLevel?.[this.levelId];
  }

  /** Flow event after a mission completes: a cutscene, or straight to the debrief. */
  afterMission(cutsceneAvailable: boolean): FlowEvent {
    return this.cutsceneAfterCurrent && cutsceneAvailable ? 'playCutscene' : 'missionDone';
  }

  /** Flow event when the debrief is closed; advances to the next mission when there is one. */
  afterDebrief(): FlowEvent {
    if (this.isLastMission) return 'toQuiz';
    this.index++;
    return 'nextMission';
  }
}
