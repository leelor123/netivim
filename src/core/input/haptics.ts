import { Haptics } from '@capacitor/haptics';
import type { Game } from '../../game';
import type { GameEvents } from '../gameEvents';
import { isAndroidApp } from '../../platform/android';
import type { InputDevice } from './types';

export type HapticTarget = 'gamepad' | 'phone' | 'none';
type Pulse = GameEvents['haptics:pulse'];

/**
 * Decides where a pulse goes. A controller in use gets the rumble when it has an actuator;
 * otherwise (touch, keyboard, or a pad without rumble) the phone vibrates. Keyboard users on a
 * desktop get nothing because navigator.vibrate is absent there, which the phone path tolerates.
 */
export function routeHaptic(vibrationEnabled: boolean, device: InputDevice, padHasActuator: boolean): HapticTarget {
  if (!vibrationEnabled) return 'none';
  if (device === 'gamepad' && padHasActuator) return 'gamepad';
  return 'phone';
}

const STRENGTH: Readonly<Record<Pulse['strength'], { strong: number; weak: number }>> = {
  light: { strong: 0.2, weak: 0.4 },
  medium: { strong: 0.5, weak: 0.6 },
  strong: { strong: 1, weak: 1 },
};

interface RumbleActuator {
  playEffect(
    type: 'dual-rumble',
    params: { startDelay: number; duration: number; weakMagnitude: number; strongMagnitude: number },
  ): Promise<unknown>;
}

function findActuator(): RumbleActuator | null {
  if (typeof navigator.getGamepads !== 'function') return null;
  try {
    for (const p of navigator.getGamepads()) {
      const a = (p as { vibrationActuator?: RumbleActuator | null } | null)?.vibrationActuator;
      if (p?.connected && a && typeof a.playEffect === 'function') return a;
    }
  } catch {
    // A throwing Gamepad API just means no rumble.
  }
  return null;
}

function phoneVibrate(durationMs: number): void {
  if (isAndroidApp()) {
    Haptics.vibrate({ duration: durationMs }).catch(() => undefined);
  } else if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(durationMs);
  }
}

/** Listens to haptics:pulse and routes it to the controller or the phone (BRIEF 7). */
export function installHaptics(game: Game): () => void {
  return game.bus.on('haptics:pulse', ({ strength, durationMs }) => {
    const actuator = game.input.device === 'gamepad' ? findActuator() : null;
    const target = routeHaptic(game.settings.value.controls.vibration, game.input.device, actuator !== null);
    const duration = Math.max(10, Math.min(1000, durationMs));
    if (target === 'gamepad' && actuator) {
      const m = STRENGTH[strength];
      actuator
        .playEffect('dual-rumble', { startDelay: 0, duration, weakMagnitude: m.weak, strongMagnitude: m.strong })
        .catch(() => undefined);
    } else if (target === 'phone') {
      phoneVibrate(duration);
    }
  });
}
