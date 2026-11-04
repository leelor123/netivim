import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FocusManager, type FocusInput } from '../../src/ui/focusManager';
import { ScreenManager, type ScreenHost } from '../../src/ui/screenManager';
import type { UiScreen } from '../../src/ui/uiScreen';

/**
 * CQA-1 regression: a bumper tab switch in Settings re-focuses the new tab by key while the old
 * tab button stays in the DOM. The focus manager must keep exactly one .is-focus ring.
 * Unit tests run in node, so this is a tiny fake DOM with just what FocusManager touches.
 */

class FakeClassList {
  readonly set = new Set<string>();
  add(c: string): void {
    this.set.add(c);
  }
  remove(c: string): void {
    this.set.delete(c);
  }
  contains(c: string): boolean {
    return this.set.has(c);
  }
}

class FakeDoc {
  activeElement: FakeEl | null = null;
  readonly all: FakeEl[] = [];
  querySelectorAll(sel: string): FakeEl[] {
    if (sel !== '.is-focus') throw new Error('unexpected selector ' + sel);
    return this.all.filter((e) => e.isConnected && e.classList.contains('is-focus'));
  }
}

class FakeEl {
  readonly classList = new FakeClassList();
  readonly children: FakeEl[] = [];
  readonly dataset: Record<string, string> = {};
  isConnected = true;
  parent: FakeEl | null = null;
  constructor(
    readonly ownerDocument: FakeDoc,
    key?: string,
  ) {
    if (key) this.dataset.key = key;
    ownerDocument.all.push(this);
  }
  append(...els: FakeEl[]): void {
    for (const e of els) {
      e.parent = this;
      this.children.push(e);
    }
  }
  /** Mimics a re-render: the old children leave the document. */
  replaceChildren(...els: FakeEl[]): void {
    for (const c of this.children) c.isConnected = false;
    this.children.length = 0;
    this.append(...els);
  }
  private descendants(): FakeEl[] {
    return this.children.flatMap((c) => [c, ...c.descendants()]);
  }
  contains(el: FakeEl): boolean {
    return el === this || this.descendants().includes(el);
  }
  querySelector(sel: string): FakeEl | null {
    const m = /^\[data-key="(.*)"\]$/.exec(sel);
    if (!m) throw new Error('unexpected selector ' + sel);
    return this.descendants().find((e) => e.isConnected && e.dataset.key === m[1]) ?? null;
  }
  querySelectorAll(): FakeEl[] {
    return this.descendants().filter((e) => e.isConnected && e.dataset.key !== undefined);
  }
  focus(): void {
    this.ownerDocument.activeElement = this;
  }
  scrollIntoView(): void {}
  getClientRects(): unknown[] {
    return this.isConnected ? [{}] : [];
  }
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: this.ownerDocument.all.indexOf(this) * 50, width: 100, height: 40 };
  }
  closest(): null {
    return null;
  }
}

const TABS = ['graphics', 'audio', 'controls', 'accessibility'] as const;

/** Settings-like screen: persistent tab buttons, a panel that re-renders, bumpers re-focus by key. */
function settingsLike(doc: FakeDoc, focus: () => FocusManager): UiScreen {
  const root = new FakeEl(doc);
  const tabs = TABS.map((id) => new FakeEl(doc, 'tab-' + id));
  const panel = new FakeEl(doc);
  root.append(...tabs, panel);
  let cur = 0;
  const render = (): void => panel.replaceChildren(new FakeEl(doc, 'row-' + String(TABS[cur]) + '-1'), new FakeEl(doc, 'row-' + String(TABS[cur]) + '-2'));
  render();
  return {
    id: 'settings',
    el: root as unknown as HTMLElement,
    initialFocus: () => tabs[0] as unknown as HTMLElement,
    tab: (d) => {
      cur = (cur + d + TABS.length) % TABS.length;
      render();
      focus().refocusKey('tab-' + String(TABS[cur]));
      return true;
    },
  };
}

const host: ScreenHost<UiScreen> = { mount() {}, unmount() {}, cover() {}, uncover() {} };
const input: FocusInput = {
  device: 'gamepad',
  scroll: 0,
  look: { x: 0, y: 0 },
  isDown: () => false,
  getBindings: () => ({ keyboard: {}, gamepad: {} }),
};

describe('FocusManager: exactly one focus ring (CQA-1)', () => {
  let doc: FakeDoc;
  let fm: FocusManager;
  let screens: ScreenManager<UiScreen>;

  beforeEach(() => {
    doc = new FakeDoc();
    vi.stubGlobal('CSS', { escape: (s: string) => s });
    vi.stubGlobal('HTMLButtonElement', function HTMLButtonElement() {});
    screens = new ScreenManager<UiScreen>(host);
    fm = new FocusManager({ input, screens, rtl: true, now: () => 0, reducedMotion: () => true, deferPauseKey: () => false });
    screens.push(settingsLike(doc, () => fm));
    fm.refresh();
  });
  afterEach(() => vi.unstubAllGlobals());

  const rings = (): string[] => doc.querySelectorAll('.is-focus').map((e) => e.dataset.key ?? '?');

  it('bumpers through every tab and back leave one ring, on the current tab', () => {
    expect(rings()).toEqual(['tab-graphics']);
    for (let i = 0; i < TABS.length * 2; i++) {
      expect(fm.dispatch(i % 3 === 2 ? 'tabPrev' : 'tabNext')).toBe(true);
      expect(rings()).toHaveLength(1);
      expect(rings()[0]).toBe(fm.current?.dataset.key);
    }
  });

  it('a ring placed by anyone else is cleared on the next focus move', () => {
    const stray = doc.all.find((e) => e.dataset.key === 'tab-controls') as FakeEl;
    stray.classList.add('is-focus');
    fm.dispatch('tabNext');
    expect(rings()).toHaveLength(1);
    expect(rings()[0]).not.toBe('tab-controls');
    expect(rings()[0]).toBe(fm.current?.dataset.key);
  });

  it('refocusing the element that is already current keeps one ring', () => {
    fm.refocusKey('tab-graphics');
    fm.refocusKey('tab-graphics');
    expect(rings()).toEqual(['tab-graphics']);
  });

  it('closing the last screen clears the ring', () => {
    screens.pop();
    fm.refresh();
    expect(rings()).toEqual([]);
    expect(fm.current).toBeNull();
  });
});
