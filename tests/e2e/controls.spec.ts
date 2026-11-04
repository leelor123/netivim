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

async function bootToTitle(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state)).toBe('title');
}

async function enterMission(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = window.__netivim;
    if (!g) throw new Error('no test hook');
    for (const e of ['openHub', 'openBriefing', 'startMission'] as const) g.flow.send(e);
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __pads: unknown[] };
    w.__pads = [];
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => w.__pads });
  });
});

const root = '.touch-root';

test('touch controls are hidden in menus and shown during a mission', async ({ page }) => {
  const problems = watchConsole(page);
  await bootToTitle(page);
  await expect(page.locator(root)).toBeHidden();
  await enterMission(page);
  await expect(page.locator(root)).toBeVisible();
  await expect(page.locator('.touch-btn')).toHaveCount(2);
  await page.evaluate(() => window.__netivim?.flow.setPaused(true));
  await expect(page.locator(root)).toBeHidden();
  await page.evaluate(() => window.__netivim?.flow.setPaused(false));
  await expect(page.locator(root)).toBeVisible();
  await page.evaluate(() => window.__netivim?.flow.send('abandon'));
  await expect(page.locator(root)).toBeHidden();
  expect(problems).toEqual([]);
});

test('dragging the joystick moves game.input.move and release stops it', async ({ page }) => {
  const problems = watchConsole(page);
  await bootToTitle(page);
  await enterMission(page);
  await expect(page.locator(root)).toBeVisible();
  const vp = page.viewportSize();
  if (!vp) throw new Error('no viewport');
  const x0 = vp.width * 0.2;
  const y0 = vp.height * 0.7;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + 60, y0, { steps: 4 });
  await expect.poll(() => page.evaluate(() => window.__netivim?.input.move.x ?? 0)).toBeGreaterThan(0.5);
  expect(await page.evaluate(() => window.__netivim?.input.move.y ?? 1)).toBeCloseTo(0, 1);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__netivim?.input.move.x ?? 1)).toBe(0);
  expect(problems).toEqual([]);
});

test('action buttons press and release virtual actions', async ({ page }) => {
  await bootToTitle(page);
  await enterMission(page);
  const btn = page.locator('.touch-btn[data-action="interact"]');
  await expect(btn).toBeVisible();
  const box = await btn.boundingBox();
  if (!box) throw new Error('no box');
  expect(box.width).toBeGreaterThanOrEqual(48);
  expect(box.height).toBeGreaterThanOrEqual(48);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => page.evaluate(() => window.__netivim?.input.isDown('interact'))).toBe(true);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__netivim?.input.isDown('interact'))).toBe(false);
});

test('left-handed layout mirrors the button side live', async ({ page }) => {
  await bootToTitle(page);
  await enterMission(page);
  await expect(page.locator(root)).toHaveAttribute('data-side', 'right');
  await page.evaluate(() => window.__netivim?.settings.update('controls', { touchLayout: 'left-handed' }));
  await expect(page.locator(root)).toHaveAttribute('data-side', 'left');
});

test('controller input hides touch controls instantly; the first touch brings them back', async ({ page }) => {
  const problems = watchConsole(page);
  await bootToTitle(page);
  await enterMission(page);
  await expect(page.locator(root)).toBeVisible();
  await page.evaluate(() => {
    const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: i === 2, value: i === 2 ? 1 : 0 }));
    (window as unknown as { __pads: unknown[] }).__pads = [
      { id: 'Xbox Wireless Controller (Vendor: 045e)', index: 0, connected: true, mapping: 'standard', buttons, axes: [0, 0, 0, 0] },
    ];
  });
  await expect(page.locator('html')).toHaveAttribute('data-input', 'gamepad');
  await expect(page.locator(root)).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType: 'touch' })));
  await expect(page.locator(root)).toBeVisible();
  expect(problems).toEqual([]);
});
