import { expect, test, type Page } from '@playwright/test';

/** Same driver-noise filter as core.spec.ts: only the software GL performance notes. */
const DRIVER_NOISE = /GL Driver Message \(OpenGL, Performance,/;

function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if ((msg.type() === 'error' || msg.type() === 'warning') && !DRIVER_NOISE.test(msg.text())) problems.push(msg.type() + ': ' + msg.text());
  });
  page.on('pageerror', (err) => problems.push('pageerror: ' + err.message));
  return problems;
}

const BTN = { a: 0, b: 1, y: 3, lb: 4, rb: 5, start: 9, up: 12, down: 13, left: 14, right: 15 } as const;
const ACTION_OF: Record<number, string> = { 0: 'confirm', 1: 'back', 3: 'alt', 4: 'tabPrev', 5: 'tabNext', 9: 'pause', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __pads: unknown[] };
    w.__pads = [];
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => w.__pads });
  });
});

async function bootToTitle(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state)).toBe('title');
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
}

/**
 * Presses one controller button and releases it inside the page right after the UI read it,
 * like a quick real tap. Under heavy load frames are slow and the loop runs catch-up steps, so
 * a press held across a few frames would legitimately auto-repeat.
 * Running: released from a step hook (registered after the UI's, so the UI saw the press first).
 * Paused (no steps): released one rendered frame later; the UI polls input between frames.
 */
async function pad(page: Page, button: number): Promise<void> {
  const action = ACTION_OF[button] ?? '';
  await page.evaluate(
    ([a, b]) =>
      new Promise<void>((resolve) => {
        const g = window.__netivim;
        if (!g) throw new Error('no test hook');
        const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: i === b, value: i === b ? 1 : 0 }));
        (window as unknown as { __pads: unknown[] }).__pads = [
          { id: 'Xbox Wireless Controller (Vendor: 045e)', index: 0, connected: true, mapping: 'standard', buttons, axes: [0, 0, 0, 0] },
        ];
        let seenAt = -1;
        let done = false;
        const release = (): void => {
          if (done) return;
          done = true;
          buttons[b as number] = { pressed: false, value: 0 };
          off();
          clearInterval(timer);
          resolve();
        };
        const off = g.onStep(() => {
          if (g.input.isDown(a as 'confirm')) release();
        });
        const timer = setInterval(() => {
          const frame = g.renderer.info.render.frame;
          if (seenAt < 0 && g.input.isDown(a as 'confirm')) seenAt = frame;
          if (seenAt >= 0 && frame > seenAt) release();
        }, 2);
      }),
    [action, button] as const,
  );
  await expect.poll(() => page.evaluate((a) => window.__netivim?.input.isDown(a as 'confirm') ?? true, action)).toBe(false);
}

async function connectPad(page: Page): Promise<void> {
  // First controller input (a button menus ignore) switches the UI into controller mode.
  await pad(page, BTN.y);
  await expect(page.locator('html')).toHaveAttribute('data-input', 'gamepad');
}

const focusedKey = (page: Page): Promise<string | undefined> =>
  page.evaluate(() => document.querySelector<HTMLElement>('.is-focus')?.dataset.key);

const settingsValue = <T>(page: Page, fn: string): Promise<T> =>
  page.evaluate((f) => {
    const s = window.__netivim?.settings.value as unknown as Record<string, Record<string, unknown>>;
    const [section, key] = f.split('.') as [string, string];
    return s[section]?.[key] as T;
  }, fn);

test('main menu -> settings -> change values -> back, controller only', async ({ page }) => {
  const problems = watchConsole(page);
  await bootToTitle(page);
  await connectPad(page);
  await expect.poll(() => focusedKey(page)).toBe('new-game');

  await pad(page, BTN.down);
  await expect.poll(() => focusedKey(page)).toBe('chapters');
  // RTL: Settings sits to the visual left of Chapters.
  await pad(page, BTN.left);
  await expect.poll(() => focusedKey(page)).toBe('settings');
  await pad(page, BTN.a);
  await expect(page.locator('[data-screen="settings"]')).toBeVisible();
  await expect.poll(() => focusedKey(page)).toBe('gfx-mode');

  // Left on an option control in RTL moves to the next option: auto -> preset.
  await pad(page, BTN.left);
  await expect.poll(() => settingsValue<string>(page, 'graphics.mode')).toBe('preset');

  // LB moves one tab to the visual left (the next tab in RTL): Audio.
  await pad(page, BTN.lb);
  await expect(page.locator('.nv-tab.is-active')).toHaveText('שמע');
  await pad(page, BTN.down);
  await expect.poll(() => focusedKey(page)).toBe('audio-master');
  await pad(page, BTN.left);
  await expect.poll(() => settingsValue<number>(page, 'audio.master')).toBe(0.95);
  await pad(page, BTN.right);
  await pad(page, BTN.right);
  await expect.poll(() => settingsValue<number>(page, 'audio.master')).toBe(0.85);

  await pad(page, BTN.b);
  await expect(page.locator('[data-screen="settings"]')).toHaveCount(0);
  await expect.poll(() => focusedKey(page)).toBe('settings');

  // Saved immediately: survives a reload.
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state)).toBe('title');
  expect(await settingsValue<number>(page, 'audio.master')).toBe(0.85);
  expect(problems).toEqual([]);
});

test('main menu -> settings -> change a value -> back, keyboard only', async ({ page }) => {
  const problems = watchConsole(page);
  await bootToTitle(page);
  await expect.poll(() => focusedKey(page)).toBe('new-game');
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => focusedKey(page)).toBe('chapters');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => focusedKey(page)).toBe('settings');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-screen="settings"]')).toBeVisible();
  await expect.poll(() => focusedKey(page)).toBe('gfx-mode');
  // Down to the debug overlay switch, then flip it with Enter.
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => focusedKey(page)).toBe('gfx-debugOverlay');
  await page.keyboard.press('Enter');
  await expect.poll(() => settingsValue<boolean>(page, 'graphics.debugOverlay')).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-screen="settings"]')).toHaveCount(0);
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
  expect(await page.evaluate(() => window.__netivim?.flow.paused)).toBe(false);
  expect(problems).toEqual([]);
});

test('pause menu: save to slot 2, then the exit prompt mid-mission', async ({ page }) => {
  const problems = watchConsole(page);
  await bootToTitle(page);
  await page.evaluate(() => {
    const g = window.__netivim;
    if (!g) throw new Error('no test hook');
    for (const e of ['openHub', 'openBriefing', 'startMission'] as const) g.flow.send(e);
  });
  await expect(page.locator('.nv-chip--unsaved')).toBeVisible();
  await connectPad(page);

  await pad(page, BTN.start);
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.paused)).toBe(true);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect.poll(() => focusedKey(page)).toBe('resume');

  await pad(page, BTN.down);
  await expect.poll(() => focusedKey(page)).toBe('save');
  await pad(page, BTN.a);
  await expect(page.locator('[data-screen="slots"]')).toBeVisible();
  // The game stays paused although A was pressed (the press belongs to the menu).
  expect(await page.evaluate(() => window.__netivim?.flow.paused)).toBe(true);
  await expect.poll(() => focusedKey(page)).toBe('manual-1');
  await pad(page, BTN.down);
  await expect.poll(() => focusedKey(page)).toBe('manual-2');
  await pad(page, BTN.a);
  await expect(page.getByRole('status')).toHaveText('המשחק נשמר');
  expect(await page.evaluate(() => window.__netivim?.save.load('manual-2') !== null)).toBe(true);
  expect(await page.evaluate(() => window.__netivim?.save.load('manual-1'))).toBeNull();
  await expect(page.locator('[data-screen="slots"]')).toHaveCount(0);
  await expect.poll(() => focusedKey(page)).toBe('save');

  // New progress after the save: exiting must ask (BRIEF 8.E).
  await page.evaluate(() => window.__netivim?.save.markDirty());
  await pad(page, BTN.down);
  await pad(page, BTN.down);
  await expect.poll(() => focusedKey(page)).toBe('exit');
  await pad(page, BTN.a);
  const prompt = page.getByRole('alertdialog');
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole('button')).toHaveText(['לשמור ולצאת', 'לצאת בלי לשמור', 'ביטול']);

  // B closes the prompt; still paused in the mission.
  await pad(page, BTN.b);
  await expect(prompt).toHaveCount(0);
  expect(await page.evaluate(() => [window.__netivim?.flow.state, window.__netivim?.flow.paused])).toEqual(['mission', true]);

  await pad(page, BTN.a);
  await expect(prompt).toBeVisible();
  await pad(page, BTN.down);
  await pad(page, BTN.a);
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state)).toBe('title');
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
  expect(await page.evaluate(() => window.__netivim?.flow.paused)).toBe(false);
  // Continue is now available (the slot 2 save).
  await expect(page.locator('[data-key="continue"]')).toBeEnabled();
  expect(problems).toEqual([]);
});

test('subtitles follow the subtitle size setting', async ({ page }) => {
  await bootToTitle(page);
  await page.evaluate(() => {
    const g = window.__netivim;
    // Subtitles sit under menus, so leave the title screen first.
    g?.flow.send('openHub');
    g?.settings.update('accessibility', { subtitleSize: 'xlarge' });
    g?.bus.emit('subtitle:show', { textKey: 'ui.pause.title', speakerKey: 'ui.action.map', durationMs: 0, voice: false });
  });
  const sub = page.locator('.nv-sub');
  await expect(sub).toBeVisible();
  await expect(sub).toHaveAttribute('data-size', 'xlarge');
  await expect(sub.locator('.nv-sub__line')).toHaveText('המשחק מושהה');
  await page.evaluate(() => window.__netivim?.bus.emit('subtitle:clear', {}));
  await expect(sub).toBeHidden();
});
