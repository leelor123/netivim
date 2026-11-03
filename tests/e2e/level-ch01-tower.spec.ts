import { expect, test, type Page } from '@playwright/test';
import { CART_SPOTS, fenceSpot, GRAVEL_PILE, LIGHT_CRATE, SECTION_PILE, STATION_SPOTS, TABLE_SPOT, TOWER_BASE } from '../../src/levels/ch01/tower/rules';

/**
 * Chapter 1, mission 1 "Tower and Stockade" in the browser, controller only (mocked
 * navigator.getGamepads): briefing, the whole day (unload, planning table, gravel, tower, fence,
 * searchlight, sunset), the Two Lenses panel and the debrief. Walking is shortcut by placing the
 * player next to each work spot through the test hook (software WebGL is too slow to steer the
 * whole level by hand); every action itself goes through the real controller input.
 * Zero console errors or warnings.
 */

const DRIVER_NOISE = /GL Driver Message \(OpenGL, Performance,/;
const A = 0;
const X = 2;
const Y = 3;
const DPAD_UP = 12;
const DPAD_LEFT = 14;

function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if ((msg.type() === 'error' || msg.type() === 'warning') && !DRIVER_NOISE.test(msg.text())) problems.push(msg.type() + ': ' + msg.text());
  });
  page.on('pageerror', (err) => problems.push('pageerror: ' + err.message));
  return problems;
}

interface PadState {
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const pad = {
      id: 'Xbox Wireless Controller (Vendor: 045e)',
      index: 0,
      connected: true,
      mapping: 'standard',
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
      axes: [0, 0, 0, 0],
    };
    (window as unknown as { __pad: unknown }).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
  });
});

async function setButton(page: Page, index: number, pressed: boolean): Promise<void> {
  await page.evaluate(
    ([i, p]) => {
      const pad = (window as unknown as { __pad: PadState }).__pad;
      const b = pad.buttons[i as number];
      if (b) {
        b.pressed = p as boolean;
        b.value = p ? 1 : 0;
      }
    },
    [index, pressed] as const,
  );
}

const ACTION_OF: Readonly<Record<number, string>> = { 0: 'confirm', 1: 'back', 2: 'interact', 3: 'alt', 12: 'up', 14: 'left' };
const isDown = (page: Page, action: string): Promise<boolean> => page.evaluate((a) => window.__netivim?.input.isDown(a as 'confirm') ?? false, action);

/** One press, held until a simulation step has seen it, then released until a step has seen the release. */
async function press(page: Page, index: number): Promise<void> {
  const action = ACTION_OF[index] ?? 'confirm';
  await setButton(page, index, true);
  await expect.poll(() => isDown(page, action), { timeout: 60000 }).toBe(true);
  await setButton(page, index, false);
  await expect.poll(() => isDown(page, action), { timeout: 60000 }).toBe(false);
  await page.waitForTimeout(250);
}

async function gameplayReady(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => !!window.__netivimGameplay), { timeout: 60000 }).toBe(true);
}

const flowState = (page: Page): Promise<string | undefined> => page.evaluate(() => window.__netivim?.flow.state);
const missionState = (page: Page): Promise<string | undefined> => page.evaluate(() => window.__netivimGameplay?.host?.state);

interface Spot {
  readonly x: number;
  readonly z: number;
}
/** Where to stand for each interactable (same spots the QA bot uses). */
const STAND: Readonly<Record<string, Spot>> = {
  ...Object.fromEntries(CART_SPOTS.map((c, i) => ['cart-' + String(i), { x: c.x, z: c.z + 2.3 }])),
  table: { x: TABLE_SPOT.x, z: TABLE_SPOT.z + 2.2 },
  'gravel-pile': { x: GRAVEL_PILE.x, z: GRAVEL_PILE.z + 2.4 },
  ...Object.fromEntries(STATION_SPOTS.map((s, i) => ['station-' + String(i), s])),
  sections: { x: SECTION_PILE.x, z: SECTION_PILE.z + 2.3 },
  'tower-base': { x: TOWER_BASE.x - 2.2, z: TOWER_BASE.z + 1.9 },
  'light-crate': { x: LIGHT_CRATE.x, z: LIGHT_CRATE.z + 2.3 },
};

async function teleport(page: Page, at: Spot): Promise<void> {
  await page.evaluate(({ x, z }) => (window.__netivimGameplay?.host?.level?.player as unknown as { spawn(x: number, z: number, h: number): void }).spawn(x, z, Math.PI), at);
}

/** Stand at the spot, wait for the prompt with the controller glyph, press X. */
async function use(page: Page, id: string, at?: Spot): Promise<void> {
  const spot = at ?? STAND[id];
  if (!spot) throw new Error('no stand spot for ' + id);
  await teleport(page, spot);
  await expect.poll(() => page.evaluate(() => window.__netivimGameplay?.host?.interactions.focused?.id ?? null), { timeout: 60000 }).toBe(id);
  await expect(page.locator('.gp-hud__glyph')).toHaveText('X');
  await press(page, X);
}

async function startLevel(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('title');
  await gameplayReady(page);
  await page.evaluate(() => window.__netivim?.flow.send('openHub'));
  await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 60000 });
  await page.evaluate(() => window.__netivimGameplay?.beginChapter('ch01', false));
  const note = page.locator('[data-screen="gp-content-note"]');
  const start = page.locator('[data-key="start-mission"]');
  await expect(note.or(start)).toBeVisible({ timeout: 60000 });
  if (await note.isVisible()) {
    await press(page, A);
  }
  await expect(start).toBeVisible({ timeout: 60000 });
}

test('controller only: Tower and Stockade from briefing through sunset, Two Lenses and debrief', async ({ page }) => {
  test.setTimeout(480000);
  const problems = watchConsole(page);
  await startLevel(page);

  // Briefing: the historical context ("within a day") and the map with the wall outline.
  await expect(page.locator('.gp-sheet--briefing')).toContainText('בתוך יום');
  await expect(page.locator('.gp-sheet--briefing')).toContainText('1937');
  await expect(page.locator('.gp-map')).toBeVisible();
  await press(page, A);
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('mission');
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('dawn');
  await expect(page.locator('.gp-hud__objective')).toHaveText('פרקו את מסגרות העץ המוכנות מהעגלות.');
  await expect(page.locator('.gp-hud__steps')).toHaveText('0 מתוך 4');

  // Dawn: unload the four carts.
  for (let i = 0; i < 4; i++) {
    await use(page, 'cart-' + String(i));
    if (i < 3) await expect(page.locator('.gp-hud__steps')).toHaveText(String(i + 1) + ' מתוך 4');
  }
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('walls');
  await expect(page.locator('.gp-hud__objective')).toHaveText('העמידו את קירות העץ הכפולים לפי תוואי החומה.');

  // Planning table: the planning camera, the chooser panel, a misfit, a placement and lifting it again.
  await use(page, 'table');
  const panel = page.locator('[data-screen="tower-plan"]');
  await expect(panel).toBeVisible({ timeout: 60000 });
  await expect(panel).toContainText('הונחו 0 מתוך 14');
  await press(page, A); // the cursor starts on an empty yard cell: the frame does not fit
  await expect(panel).toContainText('אי אפשר לבנות כאן');
  await press(page, DPAD_LEFT);
  await press(page, DPAD_UP);
  await expect(panel).toContainText('המסגרת מתאימה');
  await press(page, A);
  await expect(panel).toContainText('הונחו 1 מתוך 14');
  await press(page, Y); // rotate cycles through fitting turns without breaking anything
  await press(page, X); // lift the frame under the cursor
  await expect(panel).toContainText('הונחו 0 מתוך 14');
  // Finish the wall through the test hook (the QA bot's planner solution).
  await page.evaluate(() => (window.__netivimGameplay?.host?.level as unknown as { botPlan(): void }).botPlan());
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('gravel');
  await expect(panel).toBeHidden();
  await expect(page.locator('.gp-hud__objective')).toHaveText('מלאו את הקיר הכפול בחצץ.');

  // Gravel: three trips of two buckets (the optional water break is skipped).
  for (const trip of [[3, 4], [1, 2], [0, 5]]) {
    await use(page, 'gravel-pile');
    for (const k of trip) await use(page, 'station-' + String(k));
  }
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('tower');

  // Tower sections, then fence and searchlight.
  for (let i = 0; i < 3; i++) {
    await use(page, 'sections');
    await use(page, 'tower-base');
  }
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('fence');
  await use(page, 'light-crate');
  await use(page, 'tower-base');
  for (let leg = 0; leg < 4; leg++) await use(page, 'fence-post', fenceSpot(leg));
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('dusk');
  await expect(page.locator('.gp-hud__objective')).toHaveText('סיימו לפני השקיעה.');

  // Dusk: switch the searchlight on; the sun runs down and the debrief plays.
  await use(page, 'tower-base');
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('lenses');
  await expect.poll(() => page.evaluate(() => (window.__netivimGameplay?.host?.level as unknown as { sim: { lit: boolean } }).sim.lit)).toBe(true);
  await page.waitForTimeout(3500);
  await press(page, A); // skip the wait for the panel
  const lenses = page.locator('[data-screen="tower-lenses"]');
  await expect(lenses).toBeVisible({ timeout: 60000 });
  await expect(lenses).toContainText('הקרקע וההתיישבות');
  await expect(lenses).toContainText('מה מוסכם');
  await expect(lenses).toContainText('מה משותף');
  await expect(lenses).toContainText('C1-102');
  await press(page, A);

  // Mission complete: debrief with the saved progress.
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('debrief');
  const done = await page.evaluate(() => {
    const s = window.__netivim?.save.load('auto');
    return s ? { completed: s.data.completedMissions, archive: s.data.unlocks.archive, codex: s.data.unlocks.codex } : null;
  });
  expect(done?.completed).toContain('tower-and-stockade');
  expect(done?.archive).toContain('peel');
  expect(done?.codex).toContain('tel-amal');
  await page.waitForTimeout(300);
  expect(problems).toEqual([]);
});

test('sunset before the searchlight shows the failure card with what really happened and a hint; retry resumes', async ({ page }) => {
  test.setTimeout(240000);
  const problems = watchConsole(page);
  await startLevel(page);
  await press(page, A);
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('dawn');
  await page.evaluate(() => window.__netivimGameplay?.host?.fail('levels.ch01.tower.fail.timeout'));
  const card = page.locator('[data-screen="gp-failure"]');
  await expect(card).toBeVisible({ timeout: 60000 });
  await expect(card).toContainText('בתוך יום');
  await expect(card).toContainText('C1-065');
  await press(page, A); // retry
  await expect(card).toBeHidden({ timeout: 60000 });
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('dawn');
  await page.waitForTimeout(300);
  expect(problems).toEqual([]);
});
