import type { ContentLabel } from '../content/schema';

/** Cutscene content is data: typed, validated by validateCutscene(), played by CutscenePlayer. */

export type Vec3Tuple = readonly [number, number, number];

export type EasingName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'smoothstep' | 'hold';

export interface CameraKey {
  /** Seconds from cutscene start. */
  readonly t: number;
  readonly position: Vec3Tuple;
  readonly target: Vec3Tuple;
  /** Vertical field of view in degrees; keeps the previous value when omitted on the first key it defaults to 50. */
  readonly fov?: number;
  /** Easing of the segment that STARTS at this key. Default 'smoothstep'. */
  readonly easing?: EasingName;
  /** Shake amplitude in world units at this key (interpolated). Dropped in reduced-motion mode. */
  readonly shake?: number;
}

export interface CameraTrack {
  readonly kind: 'camera';
  /** 'catmull-rom' bends the path through the keys (also the target); 'linear' goes straight. */
  readonly path?: 'linear' | 'catmull-rom';
  readonly keys: readonly CameraKey[];
}

export interface DofKey {
  readonly t: number;
  /** Distance in world units that is sharp. */
  readonly focusDistance: number;
  /** 0 = everything sharp, larger = shallower focus. */
  readonly aperture: number;
  readonly easing?: EasingName;
}

export interface DofTrack {
  readonly kind: 'dof';
  readonly keys: readonly DofKey[];
}

export type FadeColor = 'black' | 'sepia';

export interface FadeItem {
  readonly t: number;
  readonly durationSec: number;
  readonly color: FadeColor;
  /** 'out' goes from clear to the color, 'in' goes from the color back to clear. */
  readonly direction: 'in' | 'out';
}

export interface FadeTrack {
  readonly kind: 'fade';
  readonly items: readonly FadeItem[];
}

export interface SubtitleItem {
  readonly t: number;
  readonly textKey: string;
  readonly speakerKey: string | null;
  readonly durationMs: number;
  /** Whether the line is also narrated when voice is enabled. */
  readonly voice: boolean;
}

export interface SubtitleTrack {
  readonly kind: 'subtitles';
  readonly items: readonly SubtitleItem[];
}

export type AudioMood = 'calm' | 'tense' | 'reflective' | 'hopeful';

/** Exactly one of `cue` or `mood` must be set. */
export interface AudioItem {
  readonly t: number;
  readonly cue?: string;
  readonly intensity?: number;
  readonly mood?: AudioMood;
  readonly era?: number;
}

export interface AudioTrack {
  readonly kind: 'audio';
  readonly items: readonly AudioItem[];
}

export interface LetterboxItem {
  readonly t: number;
  readonly on: boolean;
}

export interface LetterboxTrack {
  readonly kind: 'letterbox';
  readonly items: readonly LetterboxItem[];
}

export interface TitleCardItem {
  readonly t: number;
  readonly durationSec: number;
  /** Locale key of the card text (place and date, e.g. "Jerusalem, 1948"). */
  readonly textKey: string;
}

export interface TitleTrack {
  readonly kind: 'title';
  readonly items: readonly TitleCardItem[];
}

/** Generic named event for scene scripts (e.g. "convoy-start"). */
export interface EventItem {
  readonly t: number;
  readonly name: string;
}

export interface EventTrack {
  readonly kind: 'events';
  readonly items: readonly EventItem[];
}

export type Track = CameraTrack | DofTrack | FadeTrack | SubtitleTrack | AudioTrack | LetterboxTrack | TitleTrack | EventTrack;

export interface CutsceneDefinition {
  /** Unique id, e.g. "ch01.opening". */
  readonly id: string;
  readonly durationSec: number;
  /** BRIEF 5: how the content relates to the historical record. */
  readonly label: ContentLabel;
  /** Source IDs from SOURCES.md (documented content needs at least one). */
  readonly sources: readonly string[];
  readonly tracks: readonly Track[];
}

/**
 * Implemented by the graphics pipeline (Graphics agent). The cutscene player calls
 * setDepthOfField while a cutscene has a dof track and clearDepthOfField when it ends.
 */
export interface DepthOfFieldTarget {
  setDepthOfField(focusDistance: number, aperture: number): void;
  clearDepthOfField(): void;
}

/** Visual layer driven by the player. The DOM implementation lives in overlay.ts. */
export interface CutsceneOverlay {
  /** amount 0 = clear, 1 = fully covered. */
  setFade(amount: number, color: FadeColor): void;
  setLetterbox(on: boolean): void;
  /** key null hides the card; alpha 0..1. */
  setTitleCard(textKey: string | null, alpha: number): void;
  /** 0 hides the skip ring; otherwise 0..1 progress of the skip hold. */
  setSkipProgress(progress: number): void;
  setActive(active: boolean): void;
}

/** Problems found by validateCutscene. */
export interface CutsceneProblem {
  readonly path: string;
  readonly message: string;
}

export interface ValidationContext {
  hasKey(key: string): boolean;
  /** Optional register of valid source IDs; when absent only the ID shape is checked. */
  isKnownSource?(id: string): boolean;
}
