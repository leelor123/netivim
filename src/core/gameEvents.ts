import type { FlowState } from './flow';
import type { Action, GamepadFamily, InputDevice } from './input/types';

/**
 * One button of the touch action bar. `action` is pressed while held; `scroll` (+1 / -1) holds the
 * trigger axis (zoom). `label` is display text (already translated).
 */
export interface TouchActionItem {
  readonly action?: Action;
  readonly scroll?: 1 | -1;
  readonly label: string;
}

export type UnlockKind = 'codex' | 'archive' | 'testimony' | 'achievement' | 'medal' | 'fact';
export type SaveSlotId = 'auto' | 'manual-1' | 'manual-2' | 'manual-3' | 'settings';

/** Every cross-system event. Names and payloads are a contract (docs/CONTRACTS.md). */
export interface GameEvents {
  'flow:changed': { from: FlowState; to: FlowState };
  'flow:pause-changed': { paused: boolean };
  'input:device-changed': { device: InputDevice; family: GamepadFamily | null };
  'input:gamepad-lost': { index: number };
  'input:gamepad-connected': { index: number; family: GamepadFamily };
  'save:written': { slot: SaveSlotId; reason: string };
  'save:failed': { slot: SaveSlotId; reason: string; error: string };
  'save:dirty-changed': { dirty: boolean };
  'mission:started': { missionId: string; checkpoint: string };
  'mission:checkpoint': { missionId: string; checkpoint: string };
  'mission:objective': { missionId: string; objectiveKey: string };
  'mission:failed': { missionId: string; checkpoint: string; reasonKey: string; failures: number };
  'mission:completed': { missionId: string; medals: string[] };
  'unlock:item': { kind: UnlockKind; id: string };
  'settings:changed': { key: string };
  /** Show a subtitle line (always shown, even when voice narration is off). */
  /** `label`: content label of the line (testimony, composite character); shown as a chip in the caption. */
  'subtitle:show': { textKey: string; speakerKey: string | null; durationMs: number; voice: boolean; label?: 'documented' | 'reconstructed' | 'composite' | null };
  'subtitle:clear': Record<string, never>;
  /** Play a named sound cue (sfx/ambience/music change), owned by the audio system. */
  'audio:cue': { cue: string; intensity?: number };
  /** Music mood for the procedural score. */
  'audio:mood': { mood: 'calm' | 'tense' | 'reflective' | 'hopeful'; era: number };
  'cutscene:started': { id: string };
  'cutscene:ended': { id: string; skipped: boolean };
  /** Haptic feedback request; the controls system routes it to the gamepad or the phone. */
  /** Short on-screen notice rendered by the UI (e.g. graphics quality lowered). */
  /** The pause menu asks the gameplay director to open the codex (hub only). */
  'ui:open-codex': Record<string, never>;
  'ui:toast': { textKey: string; params?: Record<string, string | number> };
  /** An interaction is in reach (the mission HUD shows its prompt); drives the touch interact button. */
  'ui:interact-available': { available: boolean };
  /**
   * Touch path for level-specific actions (planning table, skips): the touch layer shows these
   * buttons in the "toolbar" screen region while not null. Hidden on a controller.
   */
  'ui:touch-actions': { items: readonly TouchActionItem[] | null };
  'haptics:pulse': { strength: 'light' | 'medium' | 'strong'; durationMs: number };
}
