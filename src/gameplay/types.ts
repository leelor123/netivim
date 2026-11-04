import type { CutsceneDefinition } from '../cinematics/types';
import type { ChapterId } from '../content/eras';
import type { ChapterContent, ContentLabel } from '../content/schema';
import type { DifficultyLevel, DifficultyParams } from '../core/difficulty';
import type { EventBus } from '../core/events';
import type { GameEvents, TouchActionItem, UnlockKind } from '../core/gameEvents';
import type { Action, Vec2 } from '../core/input/types';
import type { MissionDefinition } from '../core/mission';
import type { GameScene } from '../render/sceneManager';
import type { WorldQuality } from '../world/quality';
import type { InteractionSystem } from './core/interaction';
import type { DecisionDef } from './core/ledger';
import type { LogisticsModel } from './modules/logistics';
import type { ObjectiveDef, ObjectiveTracker } from './core/objectives';

/**
 * Chapter-builder API. A chapter is data (ChapterDefinition) plus one level module per mission
 * (LevelDefinition). Both are registered in src/gameplay/registry.ts and loaded lazily.
 */

/** What a level reads each step; the game input in play, a scripted input under the QA bot. */
export interface LevelInput {
  readonly move: Readonly<Vec2>;
  readonly look: Readonly<Vec2>;
  /** Touch / mouse drag rotation for this step, radians (see core/input/lookDrag.ts). */
  readonly lookDrag: Readonly<Vec2>;
  readonly scroll: number;
  isDown(a: Action): boolean;
  justPressed(a: Action): boolean;
}

/** Shown on the failure card: what really happened (sourced) and one hint. */
export interface FailureInfo {
  readonly whatHappenedKey: string;
  readonly sources: readonly string[];
  readonly label: ContentLabel;
  readonly hintKey: string;
}

/** One subtitle line of a testimony lantern or a scripted moment. */
export interface Line {
  readonly textKey: string;
  readonly speakerKey: string | null;
  readonly durationMs: number;
}

/** Bot steps run in order for the current checkpoint (deterministic, fixed timestep). */
export type BotStep =
  | { readonly kind: 'walkTo'; readonly x: number; readonly z: number; readonly within?: number; readonly timeout?: number }
  | { readonly kind: 'press'; readonly action: Action }
  | { readonly kind: 'wait'; readonly seconds: number }
  | { readonly kind: 'waitFor'; readonly state: string; readonly timeout?: number }
  | { readonly kind: 'choose'; readonly optionId: string }
  /** Solves the open logistics planner greedily and confirms it. */
  | { readonly kind: 'plan' }
  | { readonly kind: 'do'; readonly label: string; run(level: Level): void };

export interface BriefingPoint {
  readonly x: number;
  readonly z: number;
  readonly kind: 'start' | 'goal' | 'item' | 'danger' | 'poi';
  readonly labelKey?: string;
}

/** Simple top-down map drawn on the briefing screen (meters, centered on the origin). */
export interface BriefingMap {
  readonly size: number;
  readonly points: readonly BriefingPoint[];
  /** Optional route polylines (roads, paths). */
  readonly routes?: readonly (readonly (readonly [number, number])[])[];
}

/** The live mission as a level sees it. */
export interface MissionControl<E extends string = string> {
  send(event: E): boolean;
  /** Soft fail: failure card, instant retry from the last checkpoint. */
  fail(reasonKey: string): void;
  readonly state: string;
  readonly checkpoint: string;
}

export interface LevelContext<E extends string = string> {
  readonly bus: EventBus<GameEvents>;
  readonly input: LevelInput;
  /** Effective difficulty parameters (level + accepted assists); read them live, they can change. */
  params(): DifficultyParams;
  difficulty(): DifficultyLevel;
  /** Minimum warning time for any threat right now (seconds, >= 2). */
  telegraph(): number;
  readonly mission: MissionControl<E>;
  readonly objectives: ObjectiveTracker;
  readonly interactions: InteractionSystem;
  /**
   * Presents a decision (dialog in play, bot choice in tests); the choice is logged to the ledger.
   * Returns false when nothing opened (the mission is not running, e.g. another decision is open).
   */
  decide(decisionId: string, onChosen: (optionId: string) => void): boolean;
  /** Opens the logistics planner (simulation waits); onConfirm runs once the plan meets its goal. */
  plan(model: LogisticsModel, onConfirm: () => void): void;
  /** Plays subtitle lines in sequence (testimony lanterns, radio calls). */
  say(lines: readonly Line[], label?: ContentLabel): void;
  unlock(kind: UnlockKind, id: string): void;
  /** Danger meter on the HUD, 0-1 (stealth notice, incoming hazard). */
  alert(level: number): void;
  /** Visible prompt label for an action on the current device (glyphFor). */
  glyph(action: Action): string;
  t(key: string, params?: Readonly<Record<string, string | number>>): string;
  readonly quality: WorldQuality;
  reducedMotion(): boolean;
  /** True under the QA bot / unit tests: no DOM, no renderer. */
  readonly headless: boolean;
  /**
   * Touch path for actions the two touch buttons (interact, alt) and the stick do not cover:
   * shows a touch action bar (null hides it). Every action a level reads must have a touch path
   * (tests/unit/touchPaths.test.ts).
   */
  touchActions(items: readonly TouchActionItem[] | null): void;
}

/** Player position and camera yaw, read by the QA bot to steer. */
export interface PlayerView {
  readonly x: number;
  readonly z: number;
  readonly cameraYaw: number;
}

/** A built, running level. */
export interface Level {
  /** Shown through the SceneManager; its update() should only animate visuals. */
  readonly scene: GameScene;
  /** Simulation step (fixed dt), called by the mission host while the mission runs. */
  update(dt: number): void;
  /** Reset to a checkpoint: start, retry, extra checkpoint, or an exact manual save (data). */
  enterCheckpoint(checkpoint: string, data: unknown): void;
  /** Extra level state stored by an exact manual save (positions, collected items). */
  snapshotData?(): unknown;
  readonly player?: PlayerView;
  /** Frees everything (scene included); must be safe to call twice. */
  dispose(): void;
}

export interface LevelDefinition<S extends string = string, E extends string = string> {
  /** Registry key (kebab-case). */
  readonly id: string;
  readonly chapterId: string;
  /** MissionMeta.id in the chapter content. */
  readonly missionId: string;
  readonly mission: MissionDefinition<S, E>;
  readonly objectives: readonly ObjectiveDef[];
  /** reasonKey -> failure card content. Every reason a level can fail with must be listed. */
  readonly failures: Readonly<Record<string, FailureInfo>>;
  /** Steps that take the bot from each checkpoint to the next one (or to complete). */
  readonly botScript: Readonly<Record<S, readonly BotStep[]>>;
  /** States that become checkpoints when the player accepts the "extra checkpoint" assist. */
  readonly extraCheckpoints?: readonly S[];
  /** Decisions this mission can present (ids are keys in save.choices). */
  readonly decisions?: readonly DecisionDef[];
  readonly briefingMap?: BriefingMap;
  /** Briefing context paragraph for this mission (otherwise only the first mission shows the chapter context). */
  readonly briefingContextKey?: string;
  /** Marks framework samples (never shipped as content). */
  readonly sample?: boolean;
  build(ctx: LevelContext<E>): Level;
}

/** Erased level type stored in the registry. */
export type AnyLevelDefinition = LevelDefinition<string, string>;

/** Identity helper that keeps the literal state/event types while authoring. */
export function defineLevel<S extends string, E extends string>(def: LevelDefinition<S, E>): AnyLevelDefinition {
  return def as unknown as AnyLevelDefinition;
}

export interface ChapterDefinition {
  readonly content: ChapterContent;
  /** Timeline slot this chapter plays from. */
  readonly timelineId: ChapterId;
  /** Level registry ids in mission order (same order as content.missions). */
  readonly levels: readonly string[];
  /** Locale keys for the briefing (context paragraph) and the map caption. */
  readonly briefingContextKey: string;
  /** Cutscene played after the last mission (registered with the cinematics system). */
  readonly cutsceneId?: string;
  /** Cutscenes played between missions: level id -> cutscene id, played after that level. */
  readonly cutsceneAfterLevel?: Readonly<Record<string, string>>;
  /** Cutscene definitions this chapter uses; registered with the cinematics system on load. */
  readonly cutscenes?: readonly CutsceneDefinition[];
  /** Decisions of all missions, for the chapter debrief ledger. */
  readonly decisions: readonly DecisionDef[];
  readonly sample?: boolean;
}

export type { DecisionDef, ObjectiveDef };
