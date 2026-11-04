import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  CARD_SLOT_OF_PARTY,
  CARD_SPOTS,
  NEIGHBOR,
  NOTE_DESK,
  NOTE_POINTS,
  PARTIES,
  PLACES,
  PLACE_SPOTS,
  RADIO,
  SIGN,
  STATION_X_OF_PARTY,
  TABLE,
} from '../../src/levels/ch01/vote/data';

/**
 * "The Vote" played through the real game (controller only, mocked gamepad): buttons do all the
 * interacting and deciding; long walks are shortened with the level's test warp, and one real
 * stick walk checks movement. Ends in the debrief with the Choice Ledger. Zero console problems.
 * Screenshots (Ultra preset) go to the OS temp folder for manual review.
 */

const DRIVER_NOISE = /GL Driver Message \(OpenGL, Performance,/;
const A = 0;
const X = 2;
const SHOTS = process.env.VOTE_SHOTS ?? tmpdir();

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

async function press(page: Page, index: number): Promise<void> {
  const action = ACTION_OF[index] ?? 'confirm';
  await setButton(page, index, true);
  await expect.poll(() => isDown(page, action), { timeout: 30000 }).toBe(true);
  await setButton(page, index, false);
  await expect.poll(() => isDown(page, action), { timeout: 30000 }).toBe(false);
  await page.waitForTimeout(200);
}

async function setStick(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([ax, ay]) => {
      const pad = (window as unknown as { __pad: PadState }).__pad;
      pad.axes[0] = ax as number;
      pad.axes[1] = ay as number;
    },
    [x, y] as const,
  );
}

const flowState = (page: Page): Promise<string | undefined> => page.evaluate(() => window.__netivim?.flow.state);
const missionState = (page: Page): Promise<string | undefined> => page.evaluate(() => window.__netivimGameplay?.host?.state);
const focusId = (page: Page): Promise<string | null> => page.evaluate(() => window.__netivimGameplay?.host?.interactions.focused?.id ?? null);

type Warpable = { warp(x: number, z: number): void };
async function warp(page: Page, x: number, z: number): Promise<void> {
  await page.evaluate(([px, pz]) => (window.__netivimGameplay?.host?.level as unknown as Warpable).warp(px as number, pz as number), [x, z] as const);
}

/** Moves next to an interactable, waits for its focus, presses interact. */
async function use(page: Page, id: string, x: number, z: number): Promise<void> {
  await warp(page, x, z);
  await expect.poll(() => focusId(page), { timeout: 30000 }).toBe(id);
  await press(page, X);
}

/** A decision screen: pick the first option, then continue. */
async function decide(page: Page): Promise<void> {
  await expect(page.locator('[data-screen="gp-decision"]')).toBeVisible({ timeout: 30000 });
  await press(page, A);
  await expect(page.locator('[data-key="decision-continue"]')).toBeVisible({ timeout: 30000 });
  await press(page, A);
  await expect(page.locator('[data-screen="gp-decision"]')).toBeHidden({ timeout: 30000 });
}

/** Software WebGL is slow at Ultra, so the run uses Low and switches to Ultra only for a picture. */
async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.__netivim?.settings.update('graphics', { mode: 'preset', preset: 'ultra' }));
  await page.waitForTimeout(6000);
  await page.screenshot({ path: join(SHOTS, 'vote-' + name + '.png') });
  await page.evaluate(() => window.__netivim?.settings.update('graphics', { mode: 'preset', preset: 'low' }));
  await page.waitForTimeout(1500);
}

test('The Vote: hall, statements, three visits, note and radio, ending in the Choice Ledger', async ({ page }) => {
  test.setTimeout(420000);
  const problems = watchConsole(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('title');
  await expect.poll(() => page.evaluate(() => !!window.__netivimGameplay), { timeout: 45000 }).toBe(true);
  await page.evaluate(() => window.__netivim?.settings.update('graphics', { mode: 'preset', preset: 'low' }));
  await page.evaluate(() => window.__netivim?.flow.send('openHub'));
  await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 60000 });

  // A one-mission chapter around the real level (the Chapter 1 definition is assembled elsewhere).
  await page.evaluate(async () => {
    const d = window.__netivimGameplay as unknown as Record<string, unknown> & { openBriefing(): Promise<void> };
    const mission = {
      id: 'the-vote',
      label: 'reconstructed',
      sources: ['C1-060'],
      gameplayType: 'DEC',
      minutes: 12,
      titleKey: 'ch01.mission.vote.title',
      summaryKey: 'ch01.mission.vote.summary',
      learningGoalKeys: ['ch01.mission.vote.goal1', 'ch01.mission.vote.goal2', 'ch01.mission.vote.goal3'],
    };
    const chapter = {
      timelineId: 'ch01',
      levels: ['the-vote'],
      briefingContextKey: 'ch01.mission.vote.summary',
      decisions: [],
      content: { id: 'ch01', titleKey: 'ch01.title', years: [1947, 1947], contentNote: false, missions: [mission], codex: [], archive: [], testimonies: [], facts: [], quiz: [] },
    };
    d.run = { chapter, index: 0, mission, levelId: 'the-vote', isLastMission: false, needsContentNote: false, afterMission: () => 'missionDone', afterDebrief: () => 'toHub' };
    await d.openBriefing();
  });
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('briefing');
  await expect(page.locator('[data-key="start-mission"]')).toBeVisible({ timeout: 60000 });
  await press(page, A);
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('mission');
  await expect(page.locator('.gp-hud__objective')).toHaveText('בחנו את המפה והשוו את השטחים המוצעים.');
  await shot(page, '1-hall');

  // A real stick walk: forward along the hall.
  const z0 = await page.evaluate(() => window.__netivimGameplay?.host?.level?.player?.z ?? 0);
  await setStick(page, 0, -0.6);
  await expect
    .poll(async () => Math.abs((await page.evaluate(() => window.__netivimGameplay?.host?.level?.player?.z ?? 0)) - z0), { timeout: 30000 })
    .toBeGreaterThan(0.3);
  await setStick(page, 0, 0);

  // cp1: the planning table, four layers, then the first decision.
  await warp(page, TABLE.stand.x, TABLE.stand.z);
  await expect.poll(() => focusId(page), { timeout: 30000 }).toBe('vote-table');
  await expect(page.locator('.gp-hud__glyph')).toHaveText('X');
  await press(page, X);
  await shot(page, '2-planning-table');
  for (let i = 0; i < 3; i++) await press(page, X);
  await press(page, X);
  await decide(page);
  await expect.poll(() => missionState(page), { timeout: 30000 }).toBe('statements');

  // cp2: carry each statement to its party.
  for (let i = 0; i < PARTIES.length; i++) {
    const spot = CARD_SPOTS[CARD_SLOT_OF_PARTY[i] ?? 0] as { x: number; z: number };
    await use(page, 'vote-card-' + String(CARD_SLOT_OF_PARTY[i]), spot.x, spot.z);
    await use(page, 'vote-station-' + String(PARTIES[i]), STATION_X_OF_PARTY[i] ?? 0, -38.4);
  }
  await expect.poll(() => missionState(page), { timeout: 30000 }).toBe('visits');

  // cp3: choose where to listen first, then one question and one piece of advice per place.
  await use(page, 'vote-sign', SIGN.x, SIGN.z - 1.3);
  await decide(page);
  for (const place of PLACES) {
    const q = PLACE_SPOTS[place].questions[0] as { x: number; z: number };
    await warp(page, q.x, q.z);
    await page.waitForTimeout(800);
    if (place === 'palestinians') await shot(page, '3-arab-town');
    await use(page, 'vote-ask-' + place + '-0', q.x, q.z);
    await page.waitForTimeout(500);
    const a = PLACE_SPOTS[place].advice;
    await use(page, 'vote-advice-' + place, a.x, a.z);
    await decide(page);
  }
  await expect.poll(() => missionState(page), { timeout: 30000 }).toBe('note');

  // cp4: the Jerusalem page and the note.
  for (let i = 0; i < PARTIES.length; i++) {
    const p = NOTE_POINTS[i] as { x: number; z: number };
    await use(page, 'vote-point-' + String(PARTIES[i]), p.x, p.z + 0.35);
  }
  await use(page, 'vote-page', NOTE_DESK.jerusalem.x, NOTE_DESK.jerusalem.z + 0.35);
  await use(page, 'vote-submit', NOTE_DESK.typewriter.x, NOTE_DESK.typewriter.z + 0.35);
  await expect.poll(() => missionState(page), { timeout: 30000 }).toBe('vote');

  // cp5: the neighbor, then the radio.
  await use(page, 'vote-neighbor', NEIGHBOR.x + 0.4, NEIGHBOR.z - 1.0);
  await decide(page);
  await warp(page, RADIO.x, RADIO.z - 1.2);
  await expect.poll(() => focusId(page), { timeout: 30000 }).toBe('vote-radio');
  await press(page, X);
  await shot(page, '4-radio');

  // The broadcast plays out, then the debrief shows the Choice Ledger.
  await expect.poll(() => flowState(page), { timeout: 180000 }).toBe('debrief');
  await expect(page.locator('.gp-ledger__row')).toHaveCount(6);
  const choices = await page.evaluate(() => window.__netivim?.save.load('auto')?.data.choices ?? {});
  expect(Object.keys(choices).sort()).toEqual(
    ['the-vote-advice-britain', 'the-vote-advice-palestinians', 'the-vote-advice-yishuv', 'the-vote-listen', 'the-vote-neighbor', 'the-vote-prepare'].sort(),
  );
  const done = await page.evaluate(() => window.__netivim?.save.load('auto')?.data.completedMissions ?? []);
  expect(done).toContain('the-vote');
  await page.waitForTimeout(300);
  expect(problems).toEqual([]);
});
