import { describe, expect, it, vi } from 'vitest';
import { DoubleConfirm } from '../../src/cinematics/skipConfirm';
import { ignoreKeyForTextEntry, isTextEntryTarget } from '../../src/core/input/textEntry';
import { createReducedMotion, isReducedMotion } from '../../src/core/reducedMotion';
import { captureNextGamepadButton } from '../../src/ui/remap';
import { canScroll, chooseScroller, scrollAxis, scrollBy, scrollDelta, SCROLL_DEAD, SCROLL_SPEED, type ScrollLike } from '../../src/ui/scrollRouting';
import { SubtitleTimer } from '../../src/ui/subtitleTimer';

function box(scrollHeight: number, clientHeight: number, scrollTop = 0): ScrollLike {
  return { scrollTop, scrollHeight, clientHeight };
}

describe('controller scroll routing', () => {
  it('prefers triggers, falls back to the right stick and ignores the dead zone', () => {
    expect(scrollAxis(0.8, -0.5)).toBe(0.8);
    expect(scrollAxis(0, 0.6)).toBe(0.6);
    expect(scrollAxis(SCROLL_DEAD - 0.01, SCROLL_DEAD - 0.01)).toBe(0);
  });

  it('converts the axis to pixels using game time', () => {
    expect(scrollDelta(1, 0.5)).toBe(SCROLL_SPEED * 0.5);
    expect(scrollDelta(-0.5, 0.1)).toBe(-0.5 * SCROLL_SPEED * 0.1);
  });

  it('only counts containers that really overflow', () => {
    expect(canScroll(box(300, 300))).toBe(false);
    expect(canScroll(box(301, 300))).toBe(false);
    expect(canScroll(box(500, 300))).toBe(true);
  });

  it('picks the overflowing container that holds focus, else the first overflowing one', () => {
    const a = box(300, 300);
    const b = box(900, 300);
    const c = box(800, 300);
    expect(chooseScroller([a, b, c], (x) => x === c)).toBe(c);
    expect(chooseScroller([a, b, c], () => false)).toBe(b);
    expect(chooseScroller([a], () => true)).toBeNull();
    expect(chooseScroller([], () => true)).toBeNull();
  });

  it('clamps scrolling to the range and reports whether it moved', () => {
    const el = box(1000, 300);
    expect(scrollBy(el, 5000)).toBe(true);
    expect(el.scrollTop).toBe(700);
    expect(scrollBy(el, 10)).toBe(false);
    expect(scrollBy(el, -5000)).toBe(true);
    expect(el.scrollTop).toBe(0);
    expect(scrollBy(el, -10)).toBe(false);
  });
});

describe('reduced motion source of truth', () => {
  it('is on when either the in-game setting or the OS preference is on', () => {
    expect(isReducedMotion(false, null)).toBe(false);
    expect(isReducedMotion(true, null)).toBe(true);
    expect(isReducedMotion(false, { matches: true })).toBe(true);
    expect(isReducedMotion(false, { matches: false })).toBe(false);
    expect(isReducedMotion(true, { matches: false })).toBe(true);
  });

  it('reads both sources live', () => {
    let setting = false;
    const os = { matches: false };
    const get = createReducedMotion(() => setting, os);
    expect(get()).toBe(false);
    os.matches = true;
    expect(get()).toBe(true);
    os.matches = false;
    setting = true;
    expect(get()).toBe(true);
  });
});

describe('subtitle timer (game time)', () => {
  it('expires only as game time passes, so a paused game keeps the caption', () => {
    const t = new SubtitleTimer();
    t.start(2000);
    expect(t.tick(0.5)).toBe(false);
    // Paused: no ticks arrive at all. Resume continues from the remaining time.
    expect(t.secondsLeft).toBeCloseTo(1.5, 5);
    expect(t.tick(1.0)).toBe(false);
    expect(t.tick(0.6)).toBe(true);
    expect(t.active).toBe(false);
  });

  it('keeps lines without a duration until cleared', () => {
    const t = new SubtitleTimer();
    t.start(0);
    expect(t.tick(100)).toBe(false);
    expect(t.active).toBe(false);
  });

  it('restarts when a new line replaces the old one', () => {
    const t = new SubtitleTimer();
    t.start(1000);
    t.tick(0.9);
    t.start(1000);
    expect(t.tick(0.5)).toBe(false);
    expect(t.tick(0.6)).toBe(true);
  });
});

describe('text entry guard', () => {
  it('detects text fields and contenteditable', () => {
    expect(isTextEntryTarget({ tagName: 'INPUT', type: 'search' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'input' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'INPUT', type: 'range' })).toBe(false);
    expect(isTextEntryTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });

  it('ignores game keys while typing but lets Escape and vertical arrows out', () => {
    const field = { tagName: 'INPUT', type: 'text' };
    expect(ignoreKeyForTextEntry('KeyA', field)).toBe(true);
    expect(ignoreKeyForTextEntry('ArrowLeft', field)).toBe(true);
    expect(ignoreKeyForTextEntry('Enter', field)).toBe(true);
    expect(ignoreKeyForTextEntry('Escape', field)).toBe(false);
    expect(ignoreKeyForTextEntry('ArrowDown', field)).toBe(false);
    expect(ignoreKeyForTextEntry('KeyA', { tagName: 'BUTTON' })).toBe(false);
  });
});

describe('cutscene skip double confirm', () => {
  it('skips on the second activation inside the window only', () => {
    const d = new DoubleConfirm(1000);
    expect(d.press(0)).toBe(false);
    expect(d.armed(500)).toBe(true);
    expect(d.press(900)).toBe(true);
    expect(d.armed(950)).toBe(false);
    expect(d.press(5000)).toBe(false);
    expect(d.press(7000)).toBe(false);
  });
});

describe('remap capture: hold Back to cancel', () => {
  function pad(pressed: number[]): { connected: boolean; index: number; buttons: { pressed: boolean; value: number }[]; axes: number[]; id: string; mapping: string } {
    const buttons = Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 }));
    return { connected: true, index: 0, buttons, axes: [0, 0, 0, 0], id: 'test', mapping: 'standard' };
  }

  it('cancels when the Back button is held long enough', async () => {
    vi.useFakeTimers();
    let down: number[] = [];
    let clock = 0;
    const p = captureNextGamepadButton({ getPads: () => [pad(down)], holdCancelButtons: [1], holdCancelMs: 1000, now: () => clock, pollMs: 50, timeoutMs: 60000 });
    await vi.advanceTimersByTimeAsync(100);
    down = [1];
    for (let i = 0; i < 30; i++) {
      clock += 50;
      await vi.advanceTimersByTimeAsync(50);
    }
    await expect(p).resolves.toBeNull();
    vi.useRealTimers();
  });

  it('still captures a quick press of the Back button as a binding', async () => {
    vi.useFakeTimers();
    let down: number[] = [];
    let clock = 0;
    const p = captureNextGamepadButton({ getPads: () => [pad(down)], holdCancelButtons: [1], holdCancelMs: 1000, now: () => clock, pollMs: 50, timeoutMs: 60000 });
    await vi.advanceTimersByTimeAsync(100);
    down = [1];
    clock += 100;
    await vi.advanceTimersByTimeAsync(100);
    down = [];
    clock += 100;
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBe(1);
    vi.useRealTimers();
  });

  it('captures other buttons immediately', async () => {
    vi.useFakeTimers();
    let down: number[] = [];
    const p = captureNextGamepadButton({ getPads: () => [pad(down)], holdCancelButtons: [1], pollMs: 50, timeoutMs: 60000 });
    await vi.advanceTimersByTimeAsync(100);
    down = [3];
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBe(3);
    vi.useRealTimers();
  });
});
