import type { DifficultyLevel } from '../difficulty';
import type { MissionSnapshot } from '../mission';

export const SAVE_VERSION = 1;

/** Where the player resumes. mission is set only for exact (manual or mission-start) saves. */
export interface ResumePoint {
  readonly screen: 'hub' | 'briefing';
  readonly chapterId: string | null;
  readonly mission: MissionSnapshot | null;
}

export interface SaveData {
  readonly version: typeof SAVE_VERSION;
  readonly createdAt: number;
  readonly resume: ResumePoint;
  readonly completedMissions: readonly string[];
  readonly completedChapters: readonly string[];
  readonly unlocks: {
    readonly codex: readonly string[];
    readonly archive: readonly string[];
    readonly testimonies: readonly string[];
    readonly achievements: readonly string[];
    readonly facts: readonly string[];
  };
  /** decisionId -> chosen optionId (Choice Ledger). */
  readonly choices: Readonly<Record<string, string>>;
  readonly medals: readonly string[];
  readonly difficulty: DifficultyLevel;
  readonly stats: { readonly playSeconds: number; readonly peopleHelped: number };
}

export function createNewSave(now: number): SaveData {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    resume: { screen: 'hub', chapterId: null, mission: null },
    completedMissions: [],
    completedChapters: [],
    unlocks: { codex: [], archive: [], testimonies: [], achievements: [], facts: [] },
    choices: {},
    medals: [],
    difficulty: 'normal',
    stats: { playSeconds: 0, peopleHelped: 0 },
  };
}

const MAX_LIST = 5000;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length <= max;
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.length <= MAX_LIST && v.every((x) => isStr(x));
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function isMissionSnapshot(v: unknown): v is MissionSnapshot {
  return isObj(v) && isStr(v.missionId) && isStr(v.state) && isStr(v.checkpoint) && 'data' in v;
}

function isResume(v: unknown): v is ResumePoint {
  return (
    isObj(v) &&
    (v.screen === 'hub' || v.screen === 'briefing') &&
    (v.chapterId === null || isStr(v.chapterId)) &&
    (v.mission === null || isMissionSnapshot(v.mission))
  );
}

/** Strict structural validation of untrusted stored data (BRIEF 8.G). */
export function isSaveData(v: unknown): v is SaveData {
  if (!isObj(v) || v.version !== SAVE_VERSION || !isNum(v.createdAt) || !isResume(v.resume)) return false;
  if (!isStrList(v.completedMissions) || !isStrList(v.completedChapters) || !isStrList(v.medals)) return false;
  const u = v.unlocks;
  if (!isObj(u) || !['codex', 'archive', 'testimonies', 'achievements', 'facts'].every((k) => isStrList(u[k]))) return false;
  const c = v.choices;
  if (!isObj(c) || !Object.values(c).every((x) => isStr(x))) return false;
  if (v.difficulty !== 'story' && v.difficulty !== 'normal' && v.difficulty !== 'challenge') return false;
  const s = v.stats;
  return isObj(s) && isNum(s.playSeconds) && isNum(s.peopleHelped);
}

/** One step: data at version n becomes data at version n + 1. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;
export type MigrationTable = Readonly<Record<number, Migration>>;

/** Registered migrations, keyed by the version they upgrade FROM. */
export const MIGRATIONS: MigrationTable = {};

/** Brings stored data of any older version up to SAVE_VERSION; returns null if impossible. */
export function migrate(data: unknown, table: MigrationTable = MIGRATIONS, target = SAVE_VERSION): SaveData | null {
  if (!isObj(data) || typeof data.version !== 'number') return null;
  let cur: Record<string, unknown> = data;
  let guard = 0;
  while (typeof cur.version === 'number' && cur.version < target && guard++ < 100) {
    const step = table[cur.version];
    if (!step) return null;
    try {
      cur = step(cur);
    } catch {
      return null;
    }
  }
  return isSaveData(cur) ? cur : null;
}
