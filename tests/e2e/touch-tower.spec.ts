import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { CART_SPOTS, SOLUTION, TABLE_SPOT } from '../../src/levels/ch01/tower/rules';

/**
 * Touch only (no controller, no keyboard): Tower and Stockade from the briefing through the
 * planning table, completed with the on-screen joystick, the touch buttons and the touch action
 * bar. Walking between work spots is shortcut through the test hook (software WebGL is too slow
 * to steer); every game action goes through real touch input. Zero console errors.
 */

const DRIVER_NOISE = /GL Driver Message \(OpenGL, Performance,/;

function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if ((msg.type() === 'error' || msg.type() === 'warning') && !DRIVER_NOISE.test(msg.text())) problems.push(msg.type() + ': ' + msg.text());
  });
  page.on('pageerror', (err) => problems.push('pageerror: ' + err.message));
  return problems;
}

const flowState = (page: Page): Promise<string | undefined> => page.evaluate(() => window.__netivim?.flow.state);
const missionState = (page: Page): Promise<string | undefined> => page.evaluate(() => window.__netivimGameplay?.host?.state);

interface PlannerView {
  cx: number;
  cy: number;
  type: string;
  rot: number;
  placed: number;
}
const plannerView = (page: Page): Promise<PlannerView> =>
  page.evaluate(() => {
    const p = (window.__netivimGameplay?.host?.level as unknown as { planner: { cx: number; cy: number; type: string; rot: number; placedCount: number } }).planner;
    return { cx: p.cx, cy: p.cy, type: p.type, rot: p.rot, placed: p.placedCount };
  });

async function teleport(page: Page, x: number, z: number): Promise<void> {
  await page.evaluate(([px, pz]) => (window.__netivimGameplay?.host?.level?.player as unknown as { spawn(x: number, z: number, h: number): void }).spawn(px as number, pz as number, Math.PI), [x, z]);
}

/** Taps a touch control (touch events, so pointerType is touch). */
async function tap(page: Page, selector: string): Promise<void> {
  await page.locator(selector).first().tap();
  await page.waitForTimeout(150);
}

async function useSpot(page: Page, id: string, x: number, z: number): Promise<void> {
  await teleport(page, x, z);
  await expect.poll(() => page.evaluate(() => window.__netivimGameplay?.host?.interactions.focused?.id ?? null), { timeout: 60000 }).toBe(id);
  await expect(page.locator('.touch-btn[data-action="interact"]')).toHaveAttribute('data-state', 'ready');
  await tap(page, '.touch-btn[data-action="interact"]');
}

/** One cursor step with the virtual joystick: push, wait until the cursor moved, let go. */
async function stickStep(page: Page, cdp: CDPSession, dx: number, dy: number): Promise<void> {
  const before = await plannerView(page);
  const x0 = 170;
  const y0 = 230;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 3 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + dx * 70, y: y0 + dy * 70, id: 3 }] });
  await expect.poll(async () => {
    const v = await plannerView(page);
    return v.cx !== before.cx || v.cy !== before.cy;
  }, { timeout: 30000, intervals: [16] }).toBe(true);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(60);
}

async function cursorTo(page: Page, cdp: CDPSession, tx: number, ty: number): Promise<void> {
  for (let guard = 0; guard < 80; guard++) {
    const v = await plannerView(page);
    if (v.cx === tx && v.cy === ty) return;
    if (v.cx !== tx) await stickStep(page, cdp, v.cx < tx ? 1 : -1, 0);
    else await stickStep(page, cdp, 0, v.cy < ty ? 1 : -1);
  }
  throw new Error('cursor did not reach ' + String(tx) + ',' + String(ty));
}

const BAR = '.touch-bar__btn';

test('touch only: the Tower planning table is completed with joystick, buttons and the action bar', async ({ page }) => {
  test.setTimeout(600000);
  const problems = watchConsole(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('title');
  await expect.poll(() => page.evaluate(() => !!window.__netivimGameplay), { timeout: 60000 }).toBe(true);
  await page.evaluate(() => window.__netivim?.flow.send('openHub'));
  await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 60000 });
  await page.evaluate(() => window.__netivimGameplay?.beginChapter('ch01', false));
  const note = page.locator('[data-screen="gp-content-note"]');
  const start = page.locator('[data-key="start-mission"]');
  await expect(note.or(start)).toBeVisible({ timeout: 60000 });
  if (await note.isVisible()) await note.locator('button').first().tap();
  await expect(start).toBeVisible({ timeout: 60000 });
  await start.tap();
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('mission');
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('dawn');
  expect(await page.evaluate(() => window.__netivim?.input.device)).toBe('touch');

  // Dawn: unload the four carts with the interact touch button.
  for (let i = 0; i < 4; i++) {
    const c = CART_SPOTS[i] as { x: number; z: number };
    await useSpot(page, 'cart-' + String(i), c.x, c.z + 2.3);
  }
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('walls');

  // Planning table: panel in the side region, the touch action bar with every planning action.
  await useSpot(page, 'table', TABLE_SPOT.x, TABLE_SPOT.z + 2.2);
  const panel = page.locator('[data-screen="tower-plan"]');
  await expect(panel).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.touch-bar')).toBeVisible();
  const actions = await page.locator(BAR).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.action));
  expect(actions).toEqual(['tabPrev', 'tabNext', 'alt', 'confirm', 'interact', 'map', 'back']);
  for (const box of await page.locator(BAR).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as { width: number; height: number }))) {
    expect(box.width).toBeGreaterThanOrEqual(48);
    expect(box.height).toBeGreaterThanOrEqual(48);
  }
  const cdp = await page.context().newCDPSession(page);

  // Type buttons cycle the frame type; place on an empty yard cell explains the misfit.
  const t0 = (await plannerView(page)).type;
  await tap(page, BAR + '[data-action="tabNext"]');
  await expect.poll(async () => (await plannerView(page)).type).not.toBe(t0);
  await tap(page, BAR + '[data-action="tabPrev"]');
  await expect.poll(async () => (await plannerView(page)).type).toBe(t0);
  await tap(page, BAR + '[data-action="confirm"]');
  await expect(panel).toContainText('אי אפשר לבנות כאן');

  // Place one frame, lift it with the lift button, place again and clear the board.
  const first = SOLUTION['corner-0'] as { x: number; y: number; rot: number };
  await cursorTo(page, cdp, first.x, first.y);
  await tap(page, BAR + '[data-action="confirm"]');
  await expect.poll(async () => (await plannerView(page)).placed).toBe(1);
  await tap(page, BAR + '[data-action="interact"]');
  await expect.poll(async () => (await plannerView(page)).placed).toBe(0);
  await tap(page, BAR + '[data-action="confirm"]');
  await expect.poll(async () => (await plannerView(page)).placed).toBe(1);
  await tap(page, BAR + '[data-action="map"]');
  await expect.poll(async () => (await plannerView(page)).placed).toBe(0);

  // Exit and come back (the exit button leaves the table; the interact button reopens it).
  await tap(page, BAR + '[data-action="back"]');
  await expect(panel).toBeHidden();
  await expect(page.locator('.touch-bar')).toBeHidden();
  await useSpot(page, 'table', TABLE_SPOT.x, TABLE_SPOT.z + 2.2);
  await expect(panel).toBeVisible();

  // The whole wall, frame by frame, touch only.
  let placed = 0;
  for (const [id, p] of Object.entries(SOLUTION)) {
    const type = id.split('-')[0] as string;
    for (let i = 0; i < 6 && (await plannerView(page)).type !== type; i++) await tap(page, BAR + '[data-action="tabNext"]');
    expect((await plannerView(page)).type).toBe(type);
    await cursorTo(page, cdp, p.x, p.y);
    for (let i = 0; i < 4 && (await plannerView(page)).rot !== p.rot; i++) await tap(page, BAR + '[data-action="alt"]');
    await tap(page, BAR + '[data-action="confirm"]');
    placed += 1;
    if (placed < Object.keys(SOLUTION).length) await expect.poll(async () => (await plannerView(page)).placed, { timeout: 30000 }).toBe(placed);
  }
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('gravel');
  await expect(panel).toBeHidden();
  await expect(page.locator('.touch-bar')).toBeHidden();
  expect(problems).toEqual([]);
});
