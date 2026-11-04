import { expect, test, type Page } from '@playwright/test';
import * as L from '../../src/levels/ch00/jaffa/layout';

/**
 * "Letters from Jaffa" E2E, controller only (mocked navigator.getGamepads): the level is started
 * through the chapter director (the Prologue chapter module is registered separately, so the
 * sample chapter's run is pointed at this level), then the courier day is played end to end:
 * address tags, the logistics planner, loading the cart, the road, the colony, the village with
 * the coffee and the Two Lenses text, the station with ticket and train, Jerusalem and the
 * shared bread. The player is moved between places (a real walk is covered by the QA-bot
 * solvability tests); every interaction goes through the gamepad. Zero console errors.
 */

const DRIVER_NOISE = /GL Driver Message \(OpenGL, Performance,/;
const A = 0;
const X = 2;

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

const ACTION_OF: Readonly<Record<number, string>> = { 0: 'confirm', 2: 'interact' };
const isDown = (page: Page, action: string): Promise<boolean> => page.evaluate((a) => window.__netivim?.input.isDown(a as 'confirm') ?? false, action);

/** One press, held until a simulation step has seen it, then released until a step has seen the release. */
async function press(page: Page, index: number): Promise<void> {
  const action = ACTION_OF[index] ?? 'confirm';
  await setButton(page, index, true);
  await expect.poll(() => isDown(page, action), { timeout: 60000 }).toBe(true);
  await setButton(page, index, false);
  await expect.poll(() => isDown(page, action), { timeout: 60000 }).toBe(false);
  await page.waitForTimeout(200);
}

const flowState = (page: Page): Promise<string | undefined> => page.evaluate(() => window.__netivim?.flow.state);
const missionState = (page: Page): Promise<string | undefined> => page.evaluate(() => window.__netivimGameplay?.host?.state);

async function teleport(page: Page, p: L.Pt, heading = 0): Promise<void> {
  await page.evaluate(
    ([x, z, h]) => (window.__netivimGameplay?.host?.level?.player as unknown as { spawn(x: number, z: number, h: number): void }).spawn(x as number, z as number, h as number),
    [p.x, p.z, heading] as const,
  );
  await page.waitForTimeout(150);
}

/** Moves next to a point and presses X. */
async function use(page: Page, p: L.Pt, expectPrompt = true): Promise<void> {
  await teleport(page, { x: p.x, z: p.z + 1.0 });
  if (expectPrompt) await expect(page.locator('.gp-hud__prompt')).toBeVisible({ timeout: 60000 });
  await press(page, X);
}

test('plays Letters from Jaffa from the port to Jerusalem with the controller, zero console errors', async ({ page }) => {
  test.setTimeout(600000);
  const problems = watchConsole(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => flowState(page), { timeout: 90000 }).toBe('title');
  await expect.poll(() => page.evaluate(() => !!window.__netivimGameplay), { timeout: 90000 }).toBe(true);
  await page.evaluate(() => window.__netivim?.flow.send('openHub'));
  await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 60000 });
  // Point the sample chapter's run at this level (the Prologue chapter module is not part of this branch).
  await page.evaluate(() => {
    const d = window.__netivimGameplay as unknown as { run: { chapter: { levels: string[] } } | null };
    let held = d.run;
    Object.defineProperty(d, 'run', {
      configurable: true,
      get: () => held,
      set: (v: { chapter: { levels: string[] } } | null) => {
        if (v) v.chapter.levels[0] = 'jaffa-letters';
        held = v;
      },
    });
    window.__netivimGameplay?.beginChapter('sample', true);
  });
  await expect.poll(() => flowState(page), { timeout: 90000 }).toBe('briefing');
  await expect(page.locator('.gp-map')).toBeVisible({ timeout: 60000 });
  await press(page, A);
  await expect.poll(() => flowState(page), { timeout: 120000 }).toBe('mission');
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('port_start');
  await expect(page.locator('.gp-hud__objective')).toHaveText('קבלו את התיק בנמל וסדרו את המשלוחים');
  await expect(page.locator('.gp-hud__steps')).toHaveText(/4/);

  // Port: read the four address tags (X glyph on a controller).
  for (const [i, tag] of L.TAGS.entries()) {
    await teleport(page, { x: tag.x, z: tag.z + 1.0 });
    await expect(page.locator('.gp-hud__prompt')).toBeVisible({ timeout: 60000 });
    if (i === 0) await expect(page.locator('.gp-hud__glyph')).toHaveText('X');
    await press(page, X);
  }
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('market');

  // The quay market: three short talks (porter, water seller, runner).
  for (const talk of L.MARKET_TALKS) await use(page, talk);
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('loaded');

  // The logistics planner: a cart on the main road plus a second vehicle on the dunes route.
  await use(page, { x: L.PLAN_DESK.x, z: L.PLAN_DESK.z + 0.6 });
  await expect(page.locator('.gp-planner')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('[data-key="plan-confirm"]')).toBeDisabled();
  await page.locator('[data-key="plus-main-road"]').click();
  await page.locator('[data-key="plus-dunes"]').click();
  await expect(page.locator('[data-key="plan-confirm"]')).toBeEnabled();
  await page.locator('[data-key="plan-confirm"]').click();
  await expect(page.locator('.gp-planner')).toHaveCount(0, { timeout: 60000 });

  // Load the cart: heavy parts first, then the parcel and the letter.
  await use(page, L.LOAD_PARTS);
  await use(page, L.LOAD_PARCEL);
  await use(page, L.LOAD_LETTER);
  await teleport(page, L.GATE_ROAD, 0.2);
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('road_colony');

  // The roadside well, then Rishon LeZion: hand over the well parts and the letter, then the cold tea.
  await use(page, L.ROAD_WELL_SIGN);
  await teleport(page, { x: L.DEBORA.x - 1.2, z: L.DEBORA.z });
  await page.waitForTimeout(300);
  const colonySteps = page.locator('.gp-hud__steps');
  for (let i = 0; i < 12 && !/2/.test((await colonySteps.textContent()) ?? ''); i++) {
    await press(page, X);
    await page.waitForTimeout(1000);
  }
  await expect(colonySteps).toHaveText(/2/, { timeout: 60000 });
  await press(page, X);
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('colony_delivered');

  // The marked path to the village.
  await teleport(page, L.VILLAGE_GATE, 1);
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('village_arrival');
  await teleport(page, { x: L.JAMILA.x - 1.2, z: L.JAMILA.z });
  await page.waitForTimeout(300);
  // Jamila asks to wait while the teleported cart is still catching up; press again like a player.
  const steps = page.locator('.gp-hud__steps');
  for (let i = 0; i < 12 && !/1/.test((await steps.textContent()) ?? ''); i++) {
    await press(page, X);
    await page.waitForTimeout(1000);
  }
  // Delivered: the village objective counts the parcel, and the labeled testimony is captioned.
  await expect(steps).toHaveText(/1/, { timeout: 60000 });
  await expect(page.locator('.nv-sub__label')).toBeVisible({ timeout: 60000 });
  await press(page, X);
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('village_delivered');

  // Back to the Jaffa station: ticket, then the train.
  await teleport(page, L.STATION_ZONE, -1.5);
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('station');
  await use(page, L.TICKET_WINDOW);
  await use(page, L.TRAIN_DOOR);
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('jerusalem_delivered');

  // The ride ends in Jerusalem; deliver the halukka letter and share the bread.
  // Interactions are off while the train rides; keep stepping next to Eliyahu until the prompt shows.
  await expect
    .poll(
      async () => {
        await teleport(page, { x: L.ELIYAHU.x - 1.2, z: L.ELIYAHU.z });
        await page.waitForTimeout(500);
        return page.locator('.gp-hud__prompt').isVisible();
      },
      { timeout: 240000 },
    )
    .toBe(true);
  await press(page, X);
  await expect(page.locator('.gp-hud__steps')).toHaveText(/1/, { timeout: 60000 });
  await press(page, X);
  await expect(page.locator('.gp-hud__steps')).toHaveText(/2/, { timeout: 60000 });

  // Debrief: the mission is complete and saved.
  await expect.poll(() => flowState(page), { timeout: 240000 }).toBe('debrief');
  await page.waitForTimeout(300);
  expect(problems).toEqual([]);
});
