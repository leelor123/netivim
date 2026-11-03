import type { ChapterContent } from '../../content/schema';
import { ASSIST_AFTER_FAILURES, type AssistOption } from '../../core/difficulty';
import type { UnlockKind } from '../../core/gameEvents';
import type { MissionSnapshot } from '../../core/mission';
import type { SaveData } from '../../core/save/schema';

/** Pure save-state transitions used by the chapter flow (all return a new SaveData). */

const UNLOCK_FIELD: Partial<Record<UnlockKind, keyof SaveData['unlocks']>> = {
  codex: 'codex',
  archive: 'archive',
  testimony: 'testimonies',
  achievement: 'achievements',
  fact: 'facts',
};

const addUnique = (list: readonly string[], id: string): readonly string[] => (list.includes(id) ? list : [...list, id]);

export function applyUnlock(s: SaveData, kind: UnlockKind, id: string): SaveData {
  if (kind === 'medal') return s.medals.includes(id) ? s : { ...s, medals: [...s.medals, id] };
  const field = UNLOCK_FIELD[kind];
  if (!field || s.unlocks[field].includes(id)) return s;
  return { ...s, unlocks: { ...s.unlocks, [field]: addUnique(s.unlocks[field], id) } };
}

export function isUnlocked(s: SaveData, kind: UnlockKind, id: string): boolean {
  if (kind === 'medal') return s.medals.includes(id);
  const field = UNLOCK_FIELD[kind];
  return !!field && s.unlocks[field].includes(id);
}

/** Before entering a mission: the resume point is the mission start (BRIEF 8.B "offer to continue"). */
export function atMissionStart(s: SaveData, chapterId: string, missionId: string, initialState: string): SaveData {
  const mission: MissionSnapshot = { missionId, state: initialState, checkpoint: initialState, data: null };
  return { ...s, resume: { screen: 'briefing', chapterId, mission } };
}

/** Exact mid-mission state, written into the game state right before a manual save can happen. */
export function withMissionSnapshot(s: SaveData, chapterId: string, snap: MissionSnapshot): SaveData {
  return { ...s, resume: { screen: 'briefing', chapterId, mission: snap } };
}

export function completeMission(s: SaveData, chapterId: string, missionId: string, medals: readonly string[] = []): SaveData {
  let medalList = s.medals;
  for (const m of medals) medalList = addUnique(medalList, m);
  return {
    ...s,
    completedMissions: addUnique(s.completedMissions, missionId),
    medals: medalList,
    resume: { screen: 'hub', chapterId, mission: null },
  };
}

export function completeChapter(s: SaveData, chapterId: string): SaveData {
  return { ...s, completedChapters: addUnique(s.completedChapters, chapterId), resume: { screen: 'hub', chapterId: null, mission: null } };
}

/** First mission of the chapter not completed yet (or the first one when replaying). */
export function nextMissionIndex(s: SaveData, content: ChapterContent): number {
  const i = content.missions.findIndex((m) => !s.completedMissions.includes(m.id));
  return i < 0 ? 0 : i;
}

export interface Recap {
  readonly chapterTitleKey: string;
  /** Title keys of completed missions of this chapter, oldest first (the last three). */
  readonly missionTitleKeys: readonly string[];
  readonly missionSummaryKeys: readonly string[];
  /** Title key of where the player continues, if anything is left. */
  readonly nextTitleKey: string | null;
  readonly choicesMade: number;
  readonly resumesMission: boolean;
}

/** "Previously on" (DESIGN feature 5): built from completed missions, choices and the resume point. */
export function buildRecap(s: SaveData, content: ChapterContent): Recap {
  const done = content.missions.filter((m) => s.completedMissions.includes(m.id)).slice(-3);
  const next = content.missions.find((m) => (s.resume.mission ? m.id === s.resume.mission.missionId : !s.completedMissions.includes(m.id))) ?? null;
  const prefixes = content.missions.map((m) => m.id + '-');
  const choicesMade = Object.keys(s.choices).filter((k) => prefixes.some((p) => k.startsWith(p))).length;
  return {
    chapterTitleKey: content.titleKey,
    missionTitleKeys: done.map((m) => m.titleKey),
    missionSummaryKeys: done.map((m) => m.summaryKey),
    nextTitleKey: next?.titleKey ?? null,
    choicesMade,
    resumesMission: s.resume.mission !== null,
  };
}

/**
 * Adaptive assist (DESIGN 3): offered (never forced) after ASSIST_AFTER_FAILURES failures at the
 * same checkpoint; declining waits for the same number of further failures before asking again.
 */
export class AssistPolicy {
  private readonly declinedAt = new Map<string, number>();
  readonly accepted = new Set<AssistOption>();

  shouldOffer(checkpoint: string, failures: number, hasExtraCheckpoints: boolean): boolean {
    const since = failures - (this.declinedAt.get(checkpoint) ?? 0);
    return since >= ASSIST_AFTER_FAILURES && this.available(hasExtraCheckpoints).length > 0;
  }

  decline(checkpoint: string, failures: number): void {
    this.declinedAt.set(checkpoint, failures);
  }

  accept(option: AssistOption): void {
    this.accepted.add(option);
  }

  /** Options still to offer; the extra checkpoint only when the level declares one. */
  available(hasExtraCheckpoints: boolean): AssistOption[] {
    const all: AssistOption[] = ['hint', 'moreTime', 'extraCheckpoint'];
    return all.filter((o) => !this.accepted.has(o) && (o !== 'extraCheckpoint' || hasExtraCheckpoints));
  }
}
