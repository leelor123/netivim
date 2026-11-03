import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/events';
import type { GameEvents } from '../../src/core/gameEvents';
import { DEFAULT_BINDINGS, remapGamepad, sanitizeBindings } from '../../src/core/input/bindings';
import { applyDeadZone, BTN, detectFamily, type GamepadLike } from '../../src/core/input/gamepad';
import { InputManager } from '../../src/core/input/inputManager';

function pad(index: number, id: string, pressed: number[] = [], axes: number[] = [0, 0, 0, 0]): GamepadLike {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 }));
  return { id, index, connected: true, mapping: 'standard', buttons, axes };
}

function setup() {
  const bus = new EventBus<GameEvents>();
  const pads: { list: (GamepadLike | null)[] } = { list: [] };
  const log: string[] = [];
  bus.on('input:device-changed', ({ device, family }) => log.push('device:' + device + ':' + String(family)));
  bus.on('input:gamepad-connected', ({ family }) => log.push('connected:' + family));
  bus.on('input:gamepad-lost', ({ index }) => log.push('lost:' + String(index)));
  const input = new InputManager(bus, { getGamepads: () => pads.list });
  const target = new EventTarget();
  input.attach(target);
  const key = (type: 'keydown' | 'keyup', code: string): void => {
    target.dispatchEvent(Object.assign(new Event(type), { code }));
  };
  const pointer = (pointerType: string): void => {
    target.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType }));
  };
  return { bus, pads, log, input, target, key, pointer };
}

describe('gamepad helpers', () => {
  it.each([
    ['Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', 'xbox'],
    ['DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 'playstation'],
    ['Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)', 'nintendo'],
    ['8BitDo something', 'generic'],
  ])('detects %s as %s', (id, fam) => {
    expect(detectFamily(id)).toBe(fam);
  });

  it('applies a rescaled radial dead zone', () => {
    const out = { x: 9, y: 9 };
    applyDeadZone(0.1, 0.1, 0.2, out);
    expect(out).toEqual({ x: 0, y: 0 });
    applyDeadZone(1, 0, 0.2, out);
    expect(out.x).toBeCloseTo(1);
    applyDeadZone(0.6, 0, 0.2, out);
    expect(out.x).toBeCloseTo(0.5);
    applyDeadZone(Number.NaN, 0, 0.2, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe('InputManager', () => {
  it('maps gamepad buttons to actions with justPressed edges', () => {
    const h = setup();
    h.pads.list = [pad(0, 'Xbox 045e', [BTN.south])];
    h.input.update();
    expect(h.input.justPressed('confirm')).toBe(true);
    h.input.update();
    expect(h.input.isDown('confirm')).toBe(true);
    expect(h.input.justPressed('confirm')).toBe(false);
    h.pads.list = [pad(0, 'Xbox 045e')];
    h.input.update();
    expect(h.input.justReleased('confirm')).toBe(true);
  });

  it('switches to gamepad on controller input and back to touch on first touch', () => {
    const h = setup();
    h.pads.list = [pad(0, 'DualSense 054c')];
    h.input.update();
    expect(h.input.device).toBe('touch');
    h.pads.list = [pad(0, 'DualSense 054c', [BTN.start])];
    h.input.update();
    expect(h.input.device).toBe('gamepad');
    expect(h.input.family).toBe('playstation');
    h.pointer('touch');
    expect(h.input.device).toBe('touch');
    expect(h.log).toEqual(['connected:playstation', 'device:gamepad:playstation', 'device:touch:null']);
  });

  it('reports a disconnect and falls back to touch', () => {
    const h = setup();
    h.pads.list = [pad(0, 'Xbox 045e', [BTN.south])];
    h.input.update();
    h.pads.list = [null];
    h.input.update();
    expect(h.log).toContain('lost:0');
    expect(h.input.device).toBe('touch');
  });

  it('keyboard drives actions, normalized movement and the keyboard device', () => {
    const h = setup();
    h.key('keydown', 'KeyW');
    h.key('keydown', 'KeyD');
    h.key('keydown', 'Enter');
    h.input.update();
    expect(h.input.device).toBe('keyboard');
    expect(h.input.isDown('confirm')).toBe(true);
    expect(h.input.isDown('up')).toBe(true);
    expect(Math.hypot(h.input.move.x, h.input.move.y)).toBeCloseTo(1);
    expect(h.input.move.y).toBeLessThan(0);
    h.target.dispatchEvent(new Event('blur'));
    h.input.update();
    expect(h.input.isDown('confirm')).toBe(false);
  });

  it('uses the stick as menu directions with hysteresis', () => {
    const h = setup();
    h.pads.list = [pad(0, 'x', [], [0, -0.7, 0, 0])];
    h.input.update();
    expect(h.input.isDown('up')).toBe(true);
    // -0.55 raw is about 0.44 after the dead zone: above release, below press.
    h.pads.list = [pad(0, 'x', [], [0, -0.55, 0, 0])];
    h.input.update();
    expect(h.input.isDown('up')).toBe(true);
    h.pads.list = [pad(0, 'x', [], [0, -0.3, 0, 0])];
    h.input.update();
    expect(h.input.isDown('up')).toBe(false);
  });

  it('reads triggers as scroll and survives a throwing getGamepads', () => {
    const bus = new EventBus<GameEvents>();
    let fail = false;
    const p = pad(0, 'x', [BTN.rt]);
    const input = new InputManager(bus, {
      getGamepads: () => {
        if (fail) throw new Error('blocked');
        return [p];
      },
    });
    input.update();
    expect(input.scroll).toBe(1);
    fail = true;
    expect(() => input.update()).not.toThrow();
  });

  it('touch buttons and joystick feed actions and movement', () => {
    const h = setup();
    h.input.setVirtual('interact', true);
    h.input.setTouchMove(0.5, 0);
    h.input.update();
    expect(h.input.isDown('interact')).toBe(true);
    expect(h.input.move.x).toBe(0.5);
    h.input.setVirtual('interact', false);
    h.input.update();
    expect(h.input.justReleased('interact')).toBe(true);
  });
});

describe('bindings', () => {
  it('remaps without duplicates', () => {
    const b = remapGamepad(DEFAULT_BINDINGS, 'interact', BTN.north);
    expect(b.gamepad[BTN.west]).toBeUndefined();
    expect(b.gamepad[BTN.north]).toEqual(['alt', 'interact']);
  });

  it('sanitizes stored bindings and refuses layouts that lose essential actions', () => {
    expect(sanitizeBindings(null)).toBe(DEFAULT_BINDINGS);
    expect(sanitizeBindings({ gamepad: { 0: ['hack'] }, keyboard: {} })).toBe(DEFAULT_BINDINGS);
    const ok = sanitizeBindings(JSON.parse(JSON.stringify(DEFAULT_BINDINGS)));
    expect(ok.gamepad[BTN.south]).toEqual(['confirm']);
  });
});
