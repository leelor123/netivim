import { afterEach, describe, expect, it, vi } from 'vitest';
import { findNext, firstInReadingOrder, horizontalDelta, tabDelta, type Box } from '../../src/ui/nav';
import { canPauseIn, cycleOption, decideExit, exitPath, pausePressResumes, sliderFromPointer, stepSlider } from '../../src/ui/logic';
import { ScreenManager, type Screen, type ScreenHost } from '../../src/ui/screenManager';
import { captureNextGamepadButton } from '../../src/ui/remap';
import { formatCoverageDate, HISTORY_COVERED_UP_TO } from '../../src/ui/coverage';
import type { GamepadLike } from '../../src/core/input/gamepad';

const box = (left: number, top: number, width = 100, height = 40): Box => ({ left, top, width, height });

describe('FocusManager navigation (nav.ts)', () => {
  // A 2x2 grid of buttons, with a wide button above it.
  const wide = box(0, 0, 220, 40);
  const tl = box(0, 60);
  const tr = box(120, 60);
  const bl = box(0, 120);
  const br = box(120, 120);
  const all = [wide, tl, tr, bl, br];

  it('starts at the top-right item in RTL and top-left in LTR', () => {
    const row = [tl, tr, bl, br];
    expect(firstInReadingOrder(row, true)).toBe(1);
    expect(firstInReadingOrder(row, false)).toBe(0);
    expect(firstInReadingOrder([], true)).toBe(-1);
  });

  it('moves physically: left is visually left, also in RTL', () => {
    expect(findNext(tr, all, 'left', true)).toBe(all.indexOf(tl));
    expect(findNext(tl, all, 'right', true)).toBe(all.indexOf(tr));
    expect(findNext(tr, all, 'down', true)).toBe(all.indexOf(br));
    expect(findNext(bl, all, 'up', true)).toBe(all.indexOf(tl));
  });

  it('does not wrap horizontally', () => {
    expect(findNext(tl, all, 'left', true)).toBe(-1);
    expect(findNext(tr, all, 'right', false)).toBe(-1);
  });

  it('wraps vertically to the other end of the same column', () => {
    expect(findNext(br, all, 'down', true)).toBe(all.indexOf(wide));
    expect(findNext(wide, all, 'up', true)).toBe(all.indexOf(br));
    const col = [box(0, 0), box(0, 50), box(0, 100)];
    expect(findNext(col[2] as Box, col, 'down', true)).toBe(0);
    expect(findNext(col[0] as Box, col, 'up', true)).toBe(2);
    expect(findNext(col[0] as Box, col, 'up', true, false)).toBe(-1);
  });

  it('breaks ties in reading order (right first in RTL)', () => {
    // From the wide button both lower buttons are equally good.
    expect(findNext(wide, all, 'down', true)).toBe(all.indexOf(tr));
    expect(findNext(wide, all, 'down', false)).toBe(all.indexOf(tl));
  });

  it('prefers the aligned neighbour over a closer diagonal one', () => {
    const from = box(0, 0);
    const diagonal = box(150, 45);
    const below = box(0, 90);
    expect(findNext(from, [from, diagonal, below], 'down', true)).toBe(2);
  });

  it('maps bumpers and horizontal adjust presses for RTL', () => {
    expect(tabDelta('tabNext', false)).toBe(1);
    expect(tabDelta('tabNext', true)).toBe(-1);
    expect(tabDelta('tabPrev', true)).toBe(1);
    expect(horizontalDelta('left', true)).toBe(1);
    expect(horizontalDelta('right', true)).toBe(-1);
    expect(horizontalDelta('right', false)).toBe(1);
  });
});

describe('slider stepping', () => {
  const vol = { min: 0, max: 1, step: 0.05 };
  it('steps on the grid without float drift and clamps', () => {
    expect(stepSlider(0.7, 1, vol)).toBe(0.75);
    expect(stepSlider(0.1, -1, vol)).toBe(0.05);
    expect(stepSlider(1, 1, vol)).toBe(1);
    expect(stepSlider(0, -1, vol)).toBe(0);
    let v = 0;
    for (let i = 0; i < 20; i++) v = stepSlider(v, 1, vol);
    expect(v).toBe(1);
  });
  it('snaps off-grid values onto the grid', () => {
    expect(stepSlider(0.73, 0, vol)).toBe(0.75);
    expect(stepSlider(0.9, 1, { min: 0.75, max: 1.5, step: 0.05 })).toBe(0.95);
  });
  it('maps a pointer position, filling from the right in RTL', () => {
    expect(sliderFromPointer(0, 0, 200, true, vol)).toBe(1);
    expect(sliderFromPointer(200, 0, 200, true, vol)).toBe(0);
    expect(sliderFromPointer(50, 0, 200, false, vol)).toBe(0.25);
    expect(sliderFromPointer(-40, 0, 200, false, vol)).toBe(0);
  });
  it('cycles options both ways', () => {
    const o = ['a', 'b', 'c'] as const;
    expect(cycleOption(o, 'c', 1)).toBe('a');
    expect(cycleOption(o, 'a', -1)).toBe('c');
  });
});

describe('exit prompt (BRIEF 8.E)', () => {
  it('prompts only mid-mission with unsaved progress', () => {
    expect(decideExit({ volatile: true, dirty: true })).toBe('prompt');
    expect(decideExit({ volatile: true, dirty: false })).toBe('exit');
    expect(decideExit({ volatile: false, dirty: true })).toBe('exit');
    expect(decideExit({ volatile: false, dirty: false })).toBe('exit');
  });
  it('finds the flow path back to the title', () => {
    expect(exitPath('mission')).toEqual(['abandon', 'toTitle']);
    expect(exitPath('cutscene')).toEqual(['abandon', 'toTitle']);
    expect(exitPath('briefing')).toEqual(['back', 'toTitle']);
    expect(exitPath('quiz')).toEqual(['toHub', 'toTitle']);
    expect(exitPath('hub')).toEqual(['toTitle']);
    expect(exitPath('title')).toEqual([]);
  });
});

describe('pause press while paused', () => {
  it('Start resumes from anywhere in the pause menu', () => {
    expect(pausePressResumes({ pressedPause: true, pressedBack: false, recentUiKey: false })).toBe(true);
    expect(pausePressResumes({ pressedPause: false, pressedBack: true, recentUiKey: false })).toBe(false);
  });
  it('Escape resumes at the pause root but not when the UI used it to go back', () => {
    expect(pausePressResumes({ pressedPause: true, pressedBack: true, recentUiKey: false })).toBe(true);
    expect(pausePressResumes({ pressedPause: true, pressedBack: true, recentUiKey: true })).toBe(false);
  });
  it('never pauses on the title or boot screens', () => {
    expect(canPauseIn('title')).toBe(false);
    expect(canPauseIn('boot')).toBe(false);
    expect(canPauseIn('mission')).toBe(true);
  });
});

interface TestScreen extends Screen {
  log: string[];
}

function makeHost(): { host: ScreenHost<TestScreen>; events: string[] } {
  const events: string[] = [];
  return {
    events,
    host: {
      mount: (s, below) => events.push('mount:' + s.id + (below ? '<' + below.id : '')),
      unmount: (s) => events.push('unmount:' + s.id),
      cover: (s, by) => events.push('cover:' + s.id + '>' + by.id),
      uncover: (s) => events.push('uncover:' + s.id),
    },
  };
}

const scr = (id: string, extra: Partial<TestScreen> = {}): TestScreen => {
  const log: string[] = [];
  return { id, log, activate: () => log.push('activate'), dispose: () => log.push('dispose'), ...extra };
};

describe('ScreenManager', () => {
  it('pushes, covers, pops and uncovers in order', () => {
    const { host, events } = makeHost();
    const sm = new ScreenManager(host);
    const a = scr('a', { root: true });
    const b = scr('b');
    sm.push(a);
    sm.push(b);
    expect(sm.depth).toBe(2);
    expect(sm.top).toBe(b);
    expect(sm.pop()).toBe(b);
    expect(sm.top).toBe(a);
    expect(events).toEqual(['mount:a', 'cover:a>b', 'mount:b<a', 'unmount:b', 'uncover:a']);
    expect(a.log).toEqual(['activate', 'activate']);
    expect(b.log).toEqual(['activate', 'dispose']);
  });

  it('back pops, but not a root screen, and lets the top handle it first', () => {
    const { host } = makeHost();
    const sm = new ScreenManager(host);
    let handled = 0;
    sm.push(scr('root', { root: true }));
    expect(sm.back()).toBe(false);
    sm.push(
      scr('sub', {
        back: () => {
          handled++;
          return handled === 1;
        },
      }),
    );
    expect(sm.back()).toBe(true);
    expect(sm.depth).toBe(2);
    expect(sm.back()).toBe(true);
    expect(sm.depth).toBe(1);
  });

  it('replace swaps the top; reset and clear empty the stack', () => {
    const { host, events } = makeHost();
    const sm = new ScreenManager(host);
    let changes = 0;
    sm.onChange(() => changes++);
    sm.push(scr('a'));
    sm.push(scr('b'));
    sm.replace(scr('c'));
    expect(sm.screens.map((s) => s.id)).toEqual(['a', 'c']);
    expect(events).toContain('unmount:b');
    expect(events).not.toContain('uncover:a');
    const d = scr('d');
    sm.reset(d);
    expect(sm.screens.map((s) => s.id)).toEqual(['d']);
    sm.push(scr('e'));
    sm.push(scr('f'));
    sm.popTo(d);
    expect(sm.top).toBe(d);
    sm.clear();
    expect(sm.depth).toBe(0);
    expect(sm.pop()).toBeNull();
    expect(changes).toBeGreaterThan(5);
  });

  it('routes tab bumpers to the top screen', () => {
    const { host } = makeHost();
    const sm = new ScreenManager(host);
    const seen: number[] = [];
    sm.push(scr('tabs', { tab: (d) => (seen.push(d), true) }));
    expect(sm.tab(-1)).toBe(true);
    expect(seen).toEqual([-1]);
  });
});

describe('captureNextGamepadButton', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const pad = (pressed: number[]): GamepadLike => ({
    id: 'Xbox',
    index: 0,
    connected: true,
    mapping: 'standard',
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
    axes: [0, 0, 0, 0],
  });

  it('ignores the held button and resolves with a new press', async () => {
    vi.useFakeTimers();
    let pads: GamepadLike[] = [pad([0])];
    const p = captureNextGamepadButton({ getPads: () => pads, pollMs: 10 });
    await vi.advanceTimersByTimeAsync(50);
    pads = [pad([0, 5])];
    await vi.advanceTimersByTimeAsync(20);
    await expect(p).resolves.toBe(5);
  });

  it('accepts the held button once it was released and pressed again', async () => {
    vi.useFakeTimers();
    let pads: GamepadLike[] = [pad([0])];
    const p = captureNextGamepadButton({ getPads: () => pads, pollMs: 10 });
    pads = [pad([])];
    await vi.advanceTimersByTimeAsync(20);
    pads = [pad([0])];
    await vi.advanceTimersByTimeAsync(20);
    await expect(p).resolves.toBe(0);
  });

  it('resolves null on timeout or abort', async () => {
    vi.useFakeTimers();
    const t = captureNextGamepadButton({ getPads: () => [], timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(120);
    await expect(t).resolves.toBeNull();
    const ac = new AbortController();
    const a = captureNextGamepadButton({ getPads: () => [], signal: ac.signal });
    ac.abort();
    await expect(a).resolves.toBeNull();
  });
});

describe('history coverage line', () => {
  it('is a valid ISO date formatted in Hebrew', () => {
    expect(HISTORY_COVERED_UP_TO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formatCoverageDate('2026-11-01')).toContain('2026');
    expect(formatCoverageDate('not-a-date')).toBe('not-a-date');
  });
});
