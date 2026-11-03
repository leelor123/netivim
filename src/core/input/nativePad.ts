import type { GamepadLike } from './gamepad';
import type { InputSources } from './inputManager';

/**
 * Fallback controller source for Android System WebViews whose navigator.getGamepads() stays
 * empty. MainActivity (NativeGamepadBridge.java) exposes NetivimPadNative and pushes controller
 * state to window.__netivimPad.s(...) only while this module has switched forwarding on.
 *
 * Wiring (lead): in game.ts use `new InputManager(bus, createInputSources(readGamepads))`.
 */
export interface NativePadHost {
  hasGamepad(): boolean;
  setForwarding(on: boolean): void;
}

declare global {
  interface Window {
    /** Injected by MainActivity on Android only. */
    NetivimPadNative?: NativePadHost;
    /** Receives pushed state from the native bridge. */
    __netivimPad?: { s(mask: number, lx: number, ly: number, rx: number, ry: number, lt: number, rt: number): void };
  }
}

/** Index used for the native pad so it never collides with a WebView-reported pad at index 0. */
export const NATIVE_PAD_INDEX = 7;
const BUTTON_COUNT = 17;
const CHECK_INTERVAL_MS = 1000;

interface MutableButton {
  pressed: boolean;
  value: number;
}

export interface FallbackSource extends InputSources {
  /** Applies one pushed state (button bitmask in standard-mapping order, then axes and triggers). */
  push(mask: number, lx: number, ly: number, rx: number, ry: number, lt: number, rt: number): void;
}

/**
 * Prefers the WebView's own gamepads. When none is connected and the host says a controller is
 * attached, turns native forwarding on and exposes it as one standard-mapping pad. Once the
 * WebView reports a pad itself, the native source retires for the rest of the session.
 */
export function createFallbackSource(
  web: () => readonly (GamepadLike | null)[],
  host: NativePadHost | undefined,
  now: () => number,
): FallbackSource {
  const buttons: MutableButton[] = Array.from({ length: BUTTON_COUNT }, () => ({ pressed: false, value: 0 }));
  const axes = [0, 0, 0, 0];
  const pad: GamepadLike = {
    id: 'Android native gamepad (Vendor: 0000 Product: 0000)',
    index: NATIVE_PAD_INDEX,
    connected: true,
    mapping: 'standard',
    buttons,
    axes,
  };
  const list: (GamepadLike | null)[] = [pad];
  let forwarding = false;
  let retired = host === undefined;
  let nativePresent = false;
  let nextCheck = 0;

  const reset = (): void => {
    for (const b of buttons) {
      b.pressed = false;
      b.value = 0;
    }
    axes.fill(0);
  };

  const setForwarding = (on: boolean): void => {
    if (on === forwarding) return;
    forwarding = on;
    if (!on) reset();
    try {
      host?.setForwarding(on);
    } catch {
      retired = true;
      forwarding = false;
    }
  };

  return {
    getGamepads() {
      const pads = web();
      if (retired) return pads;
      let webHas = false;
      for (const p of pads) {
        if (p?.connected) {
          webHas = true;
          break;
        }
      }
      if (webHas) {
        retired = true;
        setForwarding(false);
        return pads;
      }
      const t = now();
      if (t >= nextCheck) {
        nextCheck = t + CHECK_INTERVAL_MS;
        try {
          nativePresent = host?.hasGamepad() ?? false;
        } catch {
          nativePresent = false;
        }
      }
      setForwarding(nativePresent);
      return forwarding ? list : pads;
    },
    push(mask, lx, ly, rx, ry, lt, rt) {
      for (let i = 0; i < BUTTON_COUNT; i++) {
        const b = buttons[i];
        if (b) {
          b.pressed = (mask & (1 << i)) !== 0;
          b.value = b.pressed ? 1 : 0;
        }
      }
      const l2 = buttons[6];
      const r2 = buttons[7];
      if (l2 && lt > 0) {
        l2.value = lt;
        l2.pressed = l2.pressed || lt > 0.5;
      }
      if (r2 && rt > 0) {
        r2.value = rt;
        r2.pressed = r2.pressed || rt > 0.5;
      }
      axes[0] = lx;
      axes[1] = ly;
      axes[2] = rx;
      axes[3] = ry;
    },
  };
}

/** Builds the InputManager source for the running app and registers the native callback. */
export function createInputSources(web: () => readonly (GamepadLike | null)[]): InputSources {
  const source = createFallbackSource(web, window.NetivimPadNative, () => performance.now());
  window.__netivimPad = { s: source.push };
  return source;
}
