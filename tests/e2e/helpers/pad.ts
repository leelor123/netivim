import { expect, test, type Page } from '@playwright/test';

/**
 * Shared controller helpers for the controller-only QA spec (tests/e2e/controller-full.spec.ts).
 *
 * A mocked navigator.getGamepads exposes one pad whose id string selects the glyph family. All
 * input goes through that pad (buttons, sticks, triggers), never through the DOM, so the specs
 * exercise exactly what a Bluetooth controller does. Every tap also re-checks BRIEF 7:
 * no touch UI on screen while the pad is active.
 */

export type Family = 'xbox' | 'playstation' | 'nintendo';
export const FAMILIES: readonly Family[] = ['xbox', 'playstation', 'nintendo'];

/** Browser id strings as Chrome reports them for each family (vendor ids drive detectFamily). */
export const PAD_IDS: Readonly<Record<Family, string>> = {
  xbox: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
  playstation: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
  nintendo: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)',
};

/** W3C standard-mapping button indices. */
export const B = {
  south: 0,
  east: 1,
  west: 2,
  north: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  select: 8,
  start: 9,
  l3: 10,
  r3: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

/** Default role of each face button (the game's default bindings). */
export const A = B.south; // confirm
export const BACK = B.east; // back
export const X = B.west; // interact
export const Y = B.north; // alt

/**
 * What each family must print for each standard button. Written out independently of
 * src/ui/glyphs.ts on purpose: a wrong table in the product must fail here.
 */
export const GLYPHS: Readonly<Record<Family, Readonly<Record<number, string>>>> = {
  xbox: { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'View', 9: 'Menu', 10: 'LS' },
  playstation: { 0: '✕', 1: '○', 2: '□', 3: '△', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 8: 'Create', 9: 'Options', 10: 'L3' },
  nintendo: { 0: 'B', 1: 'A', 2: 'Y', 3: 'X', 4: 'L', 5: 'R', 6: 'ZL', 7: 'ZR', 8: '−', 9: '+', 10: 'LS' },
};

/** Tokens that identify ANOTHER family when they show up in prompt text. */
const FOREIGN_TOKENS: Readonly<Record<Family, readonly string[]>> = {
  xbox: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'ZL', 'ZR', 'Options', 'Create'],
  playstation: ['LB', 'RB', 'LT', 'RT', 'ZL', 'ZR', 'View', 'Menu'],
  nintendo: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'LB', 'RB', 'LT', 'RT', 'Options', 'Create', 'View', 'Menu'],
};

/** Words that talk about touch gestures; they must not be shown while a controller is active. */
export const PHONE_WORDS = /אצבע|גררו|גרור|הקישו|הקשה|הקש |ג׳ויסטיק|החלקה|מסך המגע|פקדי מגע/;

/** Same filter as the other specs: only the software-GL driver performance notes are ignored. */
const DRIVER_NOISE = /GL Driver Message \(OpenGL, Performance,/;

interface PadStateLike {
  connected: boolean;
  id: string;
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
}
interface QaPad {
  present: boolean;
  pad: PadStateLike;
}
type QaWindow = Window & { __qaPad: QaPad };

/** Bugs already documented in docs/CONTROLLER_QA.md: reported as annotations, not failures. */
export type KnownBugs = Readonly<Record<string, string>>;

export interface UiSnapshot {
  readonly input: string | null;
  readonly family: string | null;
  readonly touchVisible: readonly string[];
  readonly text: string;
}

export class Pad {
  readonly problems: string[] = [];
  readonly failures: string[] = [];
  private readonly noted = new Set<string>();

  private constructor(
    readonly page: Page,
    readonly family: Family,
    private readonly known: KnownBugs,
  ) {
    page.on('console', (msg) => {
      if ((msg.type() === 'error' || msg.type() === 'warning') && !DRIVER_NOISE.test(msg.text())) this.problems.push(msg.type() + ': ' + msg.text());
    });
    page.on('pageerror', (err) => this.problems.push('pageerror: ' + err.message));
  }

  /** Installs the mocked pad before the page loads. Call before the first goto. */
  static async create(page: Page, family: Family, known: KnownBugs = {}): Promise<Pad> {
    await page.addInitScript((id) => {
      const qa = {
        present: true,
        pad: {
          connected: true,
          id,
          index: 0,
          mapping: 'standard',
          buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
          axes: [0, 0, 0, 0],
        },
      };
      (window as unknown as { __qaPad: unknown }).__qaPad = qa;
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => (qa.present ? [qa.pad] : []) });
    }, PAD_IDS[family]);
    return new Pad(page, family, known);
  }

  // ---- raw input --------------------------------------------------------------------------

  /**
   * One quick tap: pressed until the game has read it, then released. Running: released from a
   * step hook registered after the UI's. Paused (no steps): released one rendered frame later.
   */
  async tap(button: number): Promise<void> {
    await this.page.evaluate(
      (b) =>
        new Promise<void>((resolve) => {
          const g = window.__netivim;
          if (!g) throw new Error('no test hook');
          const qa = (window as unknown as QaWindow).__qaPad;
          const btn = qa.pad.buttons[b];
          if (!btn) throw new Error('no button ' + String(b));
          const acts = g.input.getBindings().gamepad[b] ?? [];
          btn.pressed = true;
          btn.value = 1;
          let seenAt = -1;
          let done = false;
          const release = (): void => {
            if (done) return;
            done = true;
            btn.pressed = false;
            btn.value = 0;
            off();
            clearInterval(timer);
            clearTimeout(guard);
            resolve();
          };
          const off = g.onStep(() => {
            if (acts.length === 0 || acts.some((a) => g.input.isDown(a))) release();
          });
          const timer = setInterval(() => {
            const frame = g.renderer.info.render.frame;
            if (seenAt < 0 && (acts.length === 0 || acts.some((a) => g.input.isDown(a)))) seenAt = frame;
            if (seenAt >= 0 && frame > seenAt) release();
          }, 2);
          const guard = setTimeout(release, 4000);
        }),
      button,
    );
    // The release is read on the next update; wait for it so two taps never merge.
    await expect
      .poll(() =>
        this.page.evaluate((b) => {
          const g = window.__netivim;
          const acts = g?.input.getBindings().gamepad[b] ?? [];
          return acts.some((a) => g?.input.isDown(a) ?? false);
        }, button),
      )
      .toBe(false);
    await this.checkUi();
  }

  /** Taps until `cond` holds (a press can land inside a screen's settle window and be ignored). */
  async tapUntil(button: number, cond: () => Promise<boolean>, tries = 6): Promise<void> {
    for (let i = 0; i < tries; i++) {
      if (await cond()) return;
      await this.tap(button);
      for (let j = 0; j < 8; j++) {
        if (await cond()) return;
        await this.page.waitForTimeout(150);
      }
    }
    if (!(await cond())) throw new Error('tapUntil gave up on button ' + String(button));
  }

  /** Holds a button until `cond` holds (a cutscene skip needs a hold), or `maxMs` pass. */
  async holdUntil(button: number, cond: () => Promise<boolean>, maxMs = 8000): Promise<void> {
    await this.setButton(button, true);
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs && !(await cond())) await this.page.waitForTimeout(150);
    await this.setButton(button, false);
    await this.page.waitForTimeout(150);
  }

  async setButton(button: number, pressed: boolean): Promise<void> {
    await this.page.evaluate(
      ([b, p]) => {
        const btn = (window as unknown as QaWindow).__qaPad.pad.buttons[b as number];
        if (btn) {
          btn.pressed = p as boolean;
          btn.value = p ? 1 : 0;
        }
      },
      [button, pressed] as const,
    );
  }

  /** Left stick (axes 0 and 1). */
  async stick(x: number, y: number): Promise<void> {
    await this.page.evaluate(
      ([ax, ay]) => {
        const p = (window as unknown as QaWindow).__qaPad.pad;
        p.axes[0] = ax as number;
        p.axes[1] = ay as number;
      },
      [x, y] as const,
    );
  }

  /** Right stick (axes 2 and 3). */
  async rightStick(x: number, y: number): Promise<void> {
    await this.page.evaluate(
      ([ax, ay]) => {
        const p = (window as unknown as QaWindow).__qaPad.pad;
        p.axes[2] = ax as number;
        p.axes[3] = ay as number;
      },
      [x, y] as const,
    );
  }

  /** Analog trigger value 0..1 (lt or rt). */
  async trigger(which: 'lt' | 'rt', value: number): Promise<void> {
    await this.page.evaluate(
      ([i, v]) => {
        const btn = (window as unknown as QaWindow).__qaPad.pad.buttons[i as number];
        if (btn) {
          btn.pressed = (v as number) > 0.5;
          btn.value = v as number;
        }
      },
      [which === 'lt' ? B.lt : B.rt, value] as const,
    );
  }

  /** Plugs the pad in or out (the browser stops listing it). */
  async setPresent(present: boolean): Promise<void> {
    await this.page.evaluate((p) => {
      (window as unknown as QaWindow).__qaPad.present = p;
    }, present);
  }

  /** The first controller input switches the UI into controller mode (Y is harmless in menus). */
  async activate(): Promise<void> {
    await this.tap(B.north);
    await expect(this.page.locator('html')).toHaveAttribute('data-input', 'gamepad');
    await expect(this.page.locator('html')).toHaveAttribute('data-pad-family', this.family);
  }

  // ---- state reads ------------------------------------------------------------------------

  flow(): Promise<string | undefined> {
    return this.page.evaluate(() => window.__netivim?.flow.state);
  }

  mission(): Promise<string | undefined> {
    return this.page.evaluate(() => window.__netivimGameplay?.host?.state);
  }

  visible(selector: string): Promise<boolean> {
    return this.page.locator(selector).first().isVisible();
  }

  /** data-key (or text) of the element that has the controller focus ring. */
  focusKey(): Promise<string | null> {
    return this.page.evaluate(() => {
      const a = document.activeElement;
      const active = a instanceof HTMLElement && a !== document.body && a.dataset.key !== undefined ? a : null;
      const el = active ?? document.querySelector<HTMLElement>('.is-focus');
      return el?.dataset.key ?? el?.textContent?.trim().slice(0, 40) ?? null;
    });
  }

  /** Which glyph label this family must show for an action under the CURRENT bindings. */
  expectedGlyph(action: string): Promise<string> {
    return this.page.evaluate(
      ([a, table]) => {
        const g = window.__netivim;
        if (!g) throw new Error('no test hook');
        let best = -1;
        for (const [k, list] of Object.entries(g.input.getBindings().gamepad)) {
          if ((list as readonly string[]).includes(a as string) && (best === -1 || Number(k) < best)) best = Number(k);
        }
        return (table as Record<number, string>)[best] ?? '?';
      },
      [action, GLYPHS[this.family]] as const,
    );
  }

  // ---- BRIEF 7 checks ---------------------------------------------------------------------

  async snapshot(): Promise<UiSnapshot> {
    return this.page.evaluate(() => {
      const shown = (el: Element): boolean => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
        return !el.closest('[hidden]');
      };
      const touchVisible = Array.from(document.querySelectorAll('[data-touch-ui]'))
        .filter(shown)
        .map((el) => el.tagName.toLowerCase() + '.' + (el.getAttribute('class') ?? '').replace(/\s+/g, '.'));
      // Visible text only: skip hidden subtrees and the 3D canvas.
      const parts: string[] = [];
      const walk = (node: Node): void => {
        if (node.nodeType === Node.TEXT_NODE) {
          const s = node.textContent?.trim();
          if (s) parts.push(s);
          return;
        }
        if (!(node instanceof HTMLElement)) return;
        if (['SCRIPT', 'STYLE', 'CANVAS'].includes(node.tagName) || !shown(node)) return;
        for (const c of Array.from(node.childNodes)) walk(c);
      };
      walk(document.body);
      const root = document.documentElement;
      return { input: root.getAttribute('data-input'), family: root.getAttribute('data-pad-family'), touchVisible, text: parts.join(' | ') };
    });
  }

  /** The pad is active: no touch UI visible, right family. Runs after every tap. */
  async checkUi(): Promise<void> {
    const s = await this.snapshot();
    if (s.input !== 'gamepad') return; // pad not (yet) active, e.g. before the first input or after a disconnect
    this.check('touch-ui-visible', s.touchVisible.length === 0, 'touch UI visible on a controller: ' + s.touchVisible.join(', '));
    this.check('pad-family', s.family === this.family, 'data-pad-family is ' + String(s.family) + ', want ' + this.family);
  }

  /**
   * Soft assertion: a failure is collected (and thrown by finish()) unless the id is a documented
   * bug in docs/CONTROLLER_QA.md, in which case it is only an annotation.
   */
  check(id: string, ok: boolean, message: string): void {
    if (ok) return;
    const doc = this.known[id];
    if (doc !== undefined) {
      this.note('known:' + id, doc + ' | seen: ' + message);
      return;
    }
    this.failures.push(id + ': ' + message);
  }

  /** Records an observation once per id (shows up in the Playwright report annotations). */
  note(id: string, message: string): void {
    if (this.noted.has(id)) return;
    this.noted.add(id);
    test.info().annotations.push({ type: this.family + ' ' + id, description: message });
  }

  /** Screenshot of a failing check, kept under docs/controller-qa for the QA report. */
  async shot(name: string): Promise<void> {
    const file = 'docs/controller-qa/' + this.family + '-' + name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.png';
    await this.page.screenshot({ path: file }).catch(() => undefined);
  }

  /** The focus ring must be on screen and drawn (BRIEF 7: a clear focus highlight). */
  async expectFocusVisible(where: string): Promise<void> {
    let last = 'never checked';
    const ok = await expect
      .poll(
        async () => {
          last = await this.page.evaluate(() => {
            const shown = (el: Element): boolean => {
              const r = el.getBoundingClientRect();
              if (r.width <= 0 || r.height <= 0) return false;
              const cs = getComputedStyle(el);
              return cs.display !== 'none' && cs.visibility !== 'hidden' && !el.closest('[hidden]');
            };
            const rings = Array.from(document.querySelectorAll<HTMLElement>('.is-focus, .is-cursor')).filter(shown);
            if (rings.length > 1 && rings.filter((e) => e.classList.contains('is-focus')).length > 1) return 'several focus rings at once: ' + rings.map((e) => e.dataset.key ?? e.className).join(', ');
            const a = document.activeElement;
            const sel = Array.from(document.querySelectorAll<HTMLElement>('[aria-current="true"]')).find(shown) ?? null;
            const el = rings[0] ?? (a instanceof HTMLElement && a !== document.body && shown(a) ? a : sel);
            if (!el) return 'no focused element';
            const r = el.getBoundingClientRect();
            const name = el.dataset.key ?? el.className;
            if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return 'focused element is off screen: ' + name;
            const cs = getComputedStyle(el);
            const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
            const shadow = cs.boxShadow !== 'none';
            const before = getComputedStyle(el, '::before');
            const marker = before.content !== 'none' && before.content !== 'normal' && before.display !== 'none';
            return outline || shadow || marker || el.getAttribute('aria-current') === 'true' ? 'ok' : 'focus ring not drawn on ' + name;
          });
          return last;
        },
        { timeout: 6000, message: 'focus at ' + where },
      )
      .toBe('ok')
      .then(() => true)
      .catch(() => false);
    const id = last.startsWith('several') ? 'focus-ring-stale' : last.includes('off screen') ? 'focus-offscreen' : 'focus-visible';
    if (!ok) await this.shot(id + '-' + where);
    this.check(id, ok, where + ': ' + last);
  }

  /** Visible text must not mention a different family's buttons or touch gestures. */
  async expectPromptText(where: string): Promise<void> {
    const s = await this.snapshot();
    if (s.input !== 'gamepad') return;
    const escape = (tok: string): string => tok.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const foreign = FOREIGN_TOKENS[this.family].filter((tok) => new RegExp('(^|[\\s|(:·/])' + escape(tok) + '($|[\\s|):·/.,])').test(s.text));
    this.check('foreign-glyph', foreign.length === 0, where + ': shows ' + foreign.join(' ') + ' on a ' + this.family + ' pad');
    const phone = PHONE_WORDS.exec(s.text);
    this.check('phone-wording', phone === null, where + ': touch wording "' + (phone?.[0] ?? '') + '" while a controller is active');
  }

  /** The element that shows an action's button must carry this family's label. */
  async expectGlyphOn(selector: string, action: string, where: string): Promise<void> {
    const want = await this.expectedGlyph(action);
    const got = await this.page.locator(selector).first().textContent();
    this.check('glyph-' + action, got?.trim() === want, where + ': ' + selector + ' shows "' + String(got) + '", want "' + want + '" for ' + this.family);
  }

  /** Console must be clean and no soft check may have failed. */
  finish(): void {
    expect(this.problems, 'console errors or warnings').toEqual([]);
    expect(this.failures, 'controller checks').toEqual([]);
  }
}

/** Boots the app to the title screen with gameplay installed. */
export async function bootToTitle(pad: Pad): Promise<void> {
  const { page } = pad;
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => pad.flow(), { timeout: 90000 }).toBe('title');
  await expect(page.locator('[data-ui-screen="title"]')).toBeVisible({ timeout: 60000 });
  await expect.poll(() => page.evaluate(() => !!window.__netivimGameplay), { timeout: 90000 }).toBe(true);
}
