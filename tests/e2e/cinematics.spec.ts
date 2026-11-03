import { expect, test, type Page } from '@playwright/test';

const DRIVER_NOISE = /GL Driver Message \(OpenGL, Performance,/;

function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if ((msg.type() === 'error' || msg.type() === 'warning') && !DRIVER_NOISE.test(msg.text())) problems.push(msg.type() + ': ' + msg.text());
  });
  page.on('pageerror', (err) => problems.push('pageerror: ' + err.message));
  return problems;
}

interface Seen {
  started: string[];
  ended: { id: string; skipped: boolean }[];
  subtitles: string[];
  cleared: number;
}

declare global {
  interface Window {
    __seen?: Seen;
    __pads?: unknown[];
  }
}

async function bootAndRecord(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__pads = [];
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.__pads });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state)).toBe('title');
  await page.evaluate(() => {
    const g = window.__netivim;
    if (!g) throw new Error('no test hook');
    const seen: Seen = { started: [], ended: [], subtitles: [], cleared: 0 };
    window.__seen = seen;
    g.bus.on('cutscene:started', (e) => seen.started.push(e.id));
    g.bus.on('cutscene:ended', (e) => seen.ended.push(e));
    g.bus.on('subtitle:show', (e) => seen.subtitles.push(e.textKey));
    g.bus.on('subtitle:clear', () => (seen.cleared += 1));
  });
}

async function setPad(page: Page, pressA: boolean): Promise<void> {
  await page.evaluate((press) => {
    const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: press && i === 0, value: press && i === 0 ? 1 : 0 }));
    window.__pads = [{ id: 'Xbox Wireless Controller (Vendor: 045e)', index: 0, connected: true, mapping: 'standard', buttons, axes: [0, 0, 0, 0] }];
  }, pressA);
}

async function playDemo(page: Page): Promise<void> {
  const ok = await page.evaluate(() => window.__netivimCinematics?.play('cinematics.demo'));
  expect(ok).toBe(true);
}

test('the demo cutscene plays through: subtitle, title card, ended, no console errors', async ({ page }) => {
  const problems = watchConsole(page);
  await bootAndRecord(page);
  await playDemo(page);
  await expect.poll(() => page.evaluate(() => window.__seen?.started)).toEqual(['cinematics.demo']);
  await expect(page.locator('.cine')).toBeVisible();
  await expect(page.locator('.cine-card')).toHaveText('הגבעות, שעת בין ערביים');
  await expect.poll(() => page.evaluate(() => window.__seen?.subtitles)).toEqual(['cinematics.demo.line1']);
  await expect.poll(() => page.evaluate(() => window.__seen?.ended), { timeout: 20000 }).toEqual([{ id: 'cinematics.demo', skipped: false }]);
  await expect(page.locator('.cine')).toBeHidden();
  expect(await page.evaluate(() => (window.__seen?.cleared ?? 0) > 0)).toBe(true);
  expect(problems).toEqual([]);
});

test('holding confirm on a controller skips the cutscene', async ({ page }) => {
  const problems = watchConsole(page);
  await bootAndRecord(page);
  await setPad(page, false);
  await playDemo(page);
  await page.waitForTimeout(300);
  await setPad(page, true);
  await expect(page.locator('.cine')).toHaveClass(/cine-skip-active/);
  await expect.poll(() => page.evaluate(() => window.__seen?.ended), { timeout: 10000 }).toEqual([{ id: 'cinematics.demo', skipped: true }]);
  await expect(page.locator('.cine')).toBeHidden();
  await setPad(page, false);
  // The demo has now been seen: a quick press skips at once.
  await page.waitForTimeout(200);
  await playDemo(page);
  await page.waitForTimeout(300);
  await setPad(page, true);
  await expect.poll(() => page.evaluate(() => window.__seen?.ended.length), { timeout: 5000 }).toBe(2);
  expect(problems).toEqual([]);
});
