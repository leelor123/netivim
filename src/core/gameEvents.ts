import type { FlowState } from './flow';
import type { GamepadFamily, InputDevice } from './input/types';

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
}
