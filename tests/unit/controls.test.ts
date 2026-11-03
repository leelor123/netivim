import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, remapGamepad } from '../../src/core/input/bindings';
import { BTN, type GamepadLike } from '../../src/core/input/gamepad';
import { routeHaptic } from '../../src/core/input/haptics';
import { createFallbackSource, NATIVE_PAD_INDEX, type NativePadHost } from '../../src/core/input/nativePad';
import { glyphForBindings, keyName } from '../../src/ui/glyphs';
import { buttonSide, clampToRing, inStickHalf, stickSide, stickVector } from '../../src/ui/touch/joystick';

describe('glyphs', () => {
  const g = (a: Parameters<typeof glyphForBindings>[0], dev: 'gamepad' | 'keyboard' | 'touch', fam: Parameters<typeof glyphForBindings>[2]) =>
    glyphForBindings(a, dev, fam, DEFAULT_BINDINGS).label;

  it.each([
    ['xbox', ['A', 'B', 'X', 'Y', 'View', 'Menu', 'LB', 'RB']],
    ['playstation', ['✕', '○', '□', '△', 'Create', 'Options', 'L1', 'R1']],
    ['nintendo', ['B', 'A', 'Y', 'X', '−', '+', 'L', 'R']],
    ['generic', ['A', 'B', 'X', 'Y', 'Select', 'Start', 'L1', 'R1']],
  ] as const)('%s default prompts', (family, expected) => {
    const actions = ['confirm', 'back', 'interact', 'alt', 'map', 'pause', 'tabPrev', 'tabNext'] as const;
    expect(actions.map((a) => g(a, 'gamepad', family))).toEqual(expected);
  });

  it('null family on a gamepad falls back to generic', () => {
    expect(g('confirm', 'gamepad', null)).toBe('A');
  });

  it('follows remapped bindings', () => {
    const b = remapGamepad(DEFAULT_BINDINGS, 'interact', BTN.north);
    expect(glyphForBindings('interact', 'gamepad', 'playstation', b).label).toBe('△');
    expect(glyphForBindings('interact', 'gamepad', 'nintendo', b).label).toBe('X');
    // alt keeps its own button; the old west button no longer shows interact.
    expect(glyphForBindings('alt', 'gamepad', 'xbox', b).label).toBe('Y');
  });

  it('shows ? for an unbound action and uses key names and touch icons', () => {
    const none = { gamepad: {}, keyboard: {} };
    expect(glyphForBindings('map', 'gamepad', 'xbox', none).label).toBe('?');
    expect(g('confirm', 'keyboard', null)).toBe('Enter');
    expect(g('interact', 'keyboard', null)).toBe('E');
    expect(g('back', 'keyboard', null)).toBe('Backspace');
    expect(keyName('Digit4')).toBe('4');
    expect(g('pause', 'touch', null)).not.toBe('');
    expect(glyphForBindings('map', 'gamepad', 'xbox', none).ariaKey).toBe('controls.action.map');
  });
});

describe('joystick math', () => {
  const out = { x: 9, y: 9 };

  it('is zero inside the dead zone', () => {
    stickVector(3, 3, 64, 0.15, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it('rescales smoothly and clamps to the unit circle', () => {
    stickVector(64 * 0.575, 0, 64, 0.15, out);
    expect(out.x).toBeCloseTo(0.5, 5);
    expect(out.y).toBeCloseTo(0, 5);
    stickVector(500, 500, 64, 0.15, out);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1, 5);
    expect(out.x).toBeGreaterThan(0);
    expect(out.y).toBeGreaterThan(0);
  });

  it('keeps y down like the gamepad', () => {
    stickVector(0, -64, 64, 0.15, out);
    expect(out.y).toBeCloseTo(-1, 5);
  });

  it('clamps the knob to the ring', () => {
    clampToRing(300, 400, 50, out);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(50, 5);
    clampToRing(10, 5, 50, out);
    expect(out).toEqual({ x: 10, y: 5 });
  });

  it('mirrors for left-handed play', () => {
    expect(stickSide('right-handed')).toBe('left');
    expect(buttonSide('right-handed')).toBe('right');
    expect(stickSide('left-handed')).toBe('right');
    expect(buttonSide('left-handed')).toBe('left');
    expect(inStickHalf(100, 800, 'right-handed')).toBe(true);
    expect(inStickHalf(100, 800, 'left-handed')).toBe(false);
    expect(inStickHalf(700, 800, 'left-handed')).toBe(true);
  });
});

describe('haptics routing', () => {
  it('respects the vibration setting first', () => {
    expect(routeHaptic(false, 'gamepad', true)).toBe('none');
    expect(routeHaptic(false, 'touch', false)).toBe('none');
  });
  it('uses the controller when it is active and can rumble', () => {
    expect(routeHaptic(true, 'gamepad', true)).toBe('gamepad');
  });
  it('falls back to the phone otherwise', () => {
    expect(routeHaptic(true, 'gamepad', false)).toBe('phone');
    expect(routeHaptic(true, 'touch', true)).toBe('phone');
    expect(routeHaptic(true, 'keyboard', false)).toBe('phone');
  });
});

describe('native gamepad fallback source', () => {
  const webPad = (): GamepadLike => ({
    id: 'x',
    index: 0,
    connected: true,
    mapping: 'standard',
    buttons: [],
    axes: [],
  });

  function setup(present: boolean) {
    const state = { web: [] as (GamepadLike | null)[], time: 0, present, calls: [] as boolean[] };
    const host: NativePadHost = {
      hasGamepad: () => state.present,
      setForwarding: (on) => state.calls.push(on),
    };
    const src = createFallbackSource(() => state.web, host, () => state.time);
    return { state, src };
  }

  it('stays out of the way when no controller is attached', () => {
    const { state, src } = setup(false);
    expect(src.getGamepads()).toBe(state.web);
    expect(state.calls).toEqual([]);
  });

  it('forwards when the WebView reports nothing but a controller exists', () => {
    const { src } = setup(true);
    const pads = src.getGamepads();
    expect(pads[0]?.index).toBe(NATIVE_PAD_INDEX);
    src.push(1 << BTN.south | 1 << BTN.up, 0.5, -0.5, 0, 0, 0.8, 0);
    const p = src.getGamepads()[0];
    expect(p?.buttons[BTN.south]?.pressed).toBe(true);
    expect(p?.buttons[BTN.up]?.pressed).toBe(true);
    expect(p?.buttons[BTN.lt]?.pressed).toBe(true);
    expect(p?.buttons[BTN.lt]?.value).toBeCloseTo(0.8);
    expect(p?.axes[0]).toBe(0.5);
    expect(p?.mapping).toBe('standard');
  });

  it('retires for good once the WebView reports a pad', () => {
    const { state, src } = setup(true);
    src.getGamepads();
    state.web = [webPad()];
    expect(src.getGamepads()).toBe(state.web);
    expect(state.calls).toEqual([true, false]);
    state.web = [];
    state.time = 5000;
    expect(src.getGamepads()).toBe(state.web);
  });

  it('turns forwarding off again when the controller is removed', () => {
    const { state, src } = setup(true);
    src.getGamepads();
    src.push(1, 0, 0, 0, 0, 0, 0);
    state.present = false;
    state.time = 2000;
    expect(src.getGamepads()).toBe(state.web);
    expect(state.calls).toEqual([true, false]);
    state.present = true;
    state.time = 4000;
    expect(src.getGamepads()[0]?.buttons[0]?.pressed).toBe(false);
  });

  it('is a plain pass-through without a native host', () => {
    const web: (GamepadLike | null)[] = [];
    const src = createFallbackSource(() => web, undefined, () => 0);
    expect(src.getGamepads()).toBe(web);
  });
});
