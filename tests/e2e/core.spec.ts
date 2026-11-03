import { expect, test, type Page } from '@playwright/test';

/**
 * Headless Chromium renders WebGL with a software driver that logs its own performance notes
 * (e.g. GPU stall due to ReadPixels). They are not produced by game code, so only that exact
 * driver category is ignored.
 */
const DRIVER_NOISE = /GL Driver Message \(OpenGL, Performance,/;

/** Fails the test on any console error or warning (BRIEF 9). */
function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if ((msg.type() === 'error' || msg.type() === 'warning') && !DRIVER_NOISE.test(msg.text())) problems.push(msg.type() + ': ' + msg.text());
  });
  page.on('pageerror', (err) => problems.push('pageerror: ' + err.message));
  return problems;
}

async function bootToTitle(page: Page): Promise<void> {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state)).toBe('title');
}

/** Moves the flow into a mission through real transitions (so the save manager sees them). */
async function enterMission(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = window.__netivim;
    if (!g) throw new Error('no test hook');
    for (const e of ['openHub', 'openBriefing', 'startMission'] as const) g.flow.send(e);
  });
}

async function setMedals(page: Page, medals: string[]): Promise<void> {
  await page.evaluate((m) => {
    const g = window.__netivim;
    if (!g) throw new Error('no test hook');
    g.setState({ ...g.getState(), medals: m });
  }, medals);
}

async function hideApp(page: Page, how: 'visibilitychange' | 'pagehide'): Promise<void> {
  await page.evaluate((kind) => {
    if (kind === 'visibilitychange') {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    } else {
      window.dispatchEvent(new Event('pagehide'));
    }
  }, how);
}

async function medalsAfterReload(page: Page): Promise<readonly string[]> {
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state)).toBe('title');
  return page.evaluate(() => window.__netivim?.getState().medals ?? []);
}

test('boots to the title screen with no console errors or warnings', async ({ page }) => {
  const problems = watchConsole(page);
  await bootToTitle(page);
  await expect(page.locator('canvas#scene')).toBeVisible();
  await expect(page.locator('h1.title')).toHaveText('נתיבים');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.waitForTimeout(500);
  expect(problems).toEqual([]);
});

test.describe('save lifecycle (BRIEF 8.H)', () => {
  test('in menus: leaving the app saves', async ({ page }) => {
    await bootToTitle(page);
    await setMedals(page, ['menu']);
    await hideApp(page, 'visibilitychange');
    expect(await medalsAfterReload(page)).toEqual(['menu']);
  });

  test('mid-mission without a manual save: the stable save is kept', async ({ page }) => {
    await bootToTitle(page);
    await setMedals(page, ['stable']);
    await page.evaluate(() => window.__netivim?.save.autosave('mission-start'));
    await enterMission(page);
    await setMedals(page, ['unsaved-progress']);
    await hideApp(page, 'pagehide');
    expect(await medalsAfterReload(page)).toEqual(['stable']);
  });

  test('mid-mission after a manual save: leaving saves the exact state', async ({ page }) => {
    await bootToTitle(page);
    await enterMission(page);
    await setMedals(page, ['manual']);
    expect(await page.evaluate(() => window.__netivim?.save.saveManual('manual-1'))).toBe(true);
    await setMedals(page, ['after-manual']);
    await hideApp(page, 'pagehide');
    expect(await medalsAfterReload(page)).toEqual(['after-manual']);
  });

  test('mid-cutscene without a manual save: the stable save is kept', async ({ page }) => {
    await bootToTitle(page);
    await setMedals(page, ['before-cutscene']);
    await page.evaluate(() => window.__netivim?.save.autosave('hub'));
    await enterMission(page);
    await page.evaluate(() => window.__netivim?.flow.send('playCutscene'));
    await setMedals(page, ['mid-cutscene']);
    await hideApp(page, 'visibilitychange');
    expect(await medalsAfterReload(page)).toEqual(['before-cutscene']);
  });
});

test.describe('controller-first mode (BRIEF 7)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __pads: unknown[] };
      w.__pads = [];
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => w.__pads });
    });
  });

  async function connectPad(page: Page, pressA: boolean): Promise<void> {
    await page.evaluate((press) => {
      const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: press && i === 0, value: press && i === 0 ? 1 : 0 }));
      const w = window as unknown as { __pads: unknown[] };
      w.__pads = [{ id: 'Xbox Wireless Controller (Vendor: 045e)', index: 0, connected: true, mapping: 'standard', buttons, axes: [0, 0, 0, 0] }];
    }, pressA);
  }

  test('controller input hides touch UI; the first touch brings it back', async ({ page }) => {
    const problems = watchConsole(page);
    await bootToTitle(page);
    await page.evaluate(() => {
      const b = document.createElement('button');
      b.id = 'touch-probe';
      b.dataset.touchUi = '';
      b.textContent = 'x';
      document.body.append(b);
    });
    await expect(page.locator('#touch-probe')).toBeVisible();
    await connectPad(page, true);
    await expect(page.locator('html')).toHaveAttribute('data-input', 'gamepad');
    await expect(page.locator('html')).toHaveAttribute('data-pad-family', 'xbox');
    await expect(page.locator('#touch-probe')).toBeHidden();
    await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType: 'touch' })));
    await expect(page.locator('#touch-probe')).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('disconnecting mid-mission pauses and restores touch UI', async ({ page }) => {
    await bootToTitle(page);
    await enterMission(page);
    await connectPad(page, true);
    await expect(page.locator('html')).toHaveAttribute('data-input', 'gamepad');
    await page.evaluate(() => {
      (window as unknown as { __pads: unknown[] }).__pads = [];
    });
    await expect.poll(() => page.evaluate(() => window.__netivim?.flow.paused)).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('data-input', 'touch');
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
