import { expect, test, type Page } from '@playwright/test';

/**
 * Gameplay framework E2E, controller only (mocked navigator.getGamepads): title -> hub ->
 * chapter select (timeline) -> content note -> briefing -> SAMPLE level (walk, interact,
 * decide) -> debrief -> quiz -> hub, checking the safe-moment saves on the way. Zero console
 * errors or warnings.
 */

const DRIVER_NOISE = /GL Driver Message \(OpenGL, Performance,/;
const A = 0;
const X = 2;
const DOWN = 13;

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

const ACTION_OF: Readonly<Record<number, string>> = { 0: 'confirm', 1: 'back', 2: 'interact', 13: 'down' };

const isDown = (page: Page, action: string): Promise<boolean> =>
  page.evaluate((a) => window.__netivim?.input.isDown(a as 'confirm') ?? false, action);

/**
 * One press: held until a simulation step has seen it, then released until a step has seen the
 * release. Software WebGL can block the main thread for long stretches, so fixed sleeps could
 * put press and release into the same frame.
 */
async function press(page: Page, index: number): Promise<void> {
  const action = ACTION_OF[index] ?? 'confirm';
  await setButton(page, index, true);
  await expect.poll(() => isDown(page, action), { timeout: 30000 }).toBe(true);
  await setButton(page, index, false);
  await expect.poll(() => isDown(page, action), { timeout: 30000 }).toBe(false);
  await page.waitForTimeout(250);
}

/** The gameplay hook is set during boot; software WebGL can make boot slow. */
async function gameplayReady(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => !!window.__netivimGameplay), { timeout: 45000 }).toBe(true);
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
const autoSave = (page: Page) =>
  page.evaluate(() => {
    const s = window.__netivim?.save.load('auto');
    return s ? { resume: s.data.resume, completedMissions: s.data.completedMissions, completedChapters: s.data.completedChapters, archive: s.data.unlocks.archive, choices: s.data.choices } : null;
  });

test('controller only: hub -> chapter select -> sample level -> debrief -> quiz -> hub, with saves', async ({ page }) => {
  test.setTimeout(240000);
  const problems = watchConsole(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('title');
  await gameplayReady(page);
  await expect(page.locator('[data-ui-screen="title"]')).toBeVisible({ timeout: 60000 });

  // Title: New game is focused on a fresh profile.
  await press(page, A);
  await expect(page.locator('html')).toHaveAttribute('data-input', 'gamepad');
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('hub');
  await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 60000 });
  await expect.poll(() => autoSave(page).then((s) => s?.resume.screen ?? null)).toBe('hub');

  // Hub -> chapter select (timeline) -> timeline, then the sample chapter.
  await press(page, A);
  await expect(page.locator('[data-screen="timeline"]')).toBeVisible({ timeout: 60000 });
  // The prologue slot now opens the real chapter; this test drives the sample chapter directly.
  await press(page, 1);
  await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 60000 });
  await page.evaluate(() => window.__netivimGameplay?.beginChapter('sample', false));

  // Content note: Standard is focused first.
  await expect(page.locator('[data-screen="gp-content-note"]')).toBeVisible({ timeout: 60000 });
  await press(page, A);
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('briefing');
  await expect(page.locator('[data-screen="gp-briefing"]')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.gp-map')).toBeVisible({ timeout: 60000 });

  // Start: the mission-start autosave happens before the volatile state.
  await press(page, A);
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('mission');
  const start = await autoSave(page);
  expect(start?.resume.mission).toEqual({ missionId: 'sample-walk', state: 'walk', checkpoint: 'walk', data: null });
  await expect(page.locator('.gp-hud__objective')).toHaveText('לכו אל הסימון הזוהר');

  // Walk forward with the left stick until the marker is reached.
  await setStick(page, 0, -0.5);
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('interact');
  await setStick(page, 0, 0);
  // Slow software frames can carry the walker past the marker: nudge back into reach.
  for (let i = 0; i < 40 && !(await page.locator('.gp-hud__prompt').isVisible()); i++) {
    const z = await page.evaluate(() => window.__netivimGameplay?.host?.level?.player?.z ?? 8);
    await setStick(page, 0, z < 8 ? -0.3 : 0.3);
    await page.waitForTimeout(150);
    await setStick(page, 0, 0);
    await page.waitForTimeout(150);
  }
  await expect(page.locator('.gp-hud__prompt')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.gp-hud__glyph')).toHaveText('X');

  // Interact (X), then the decision: first option, then continue.
  await press(page, X);
  await expect(page.locator('[data-screen="gp-decision"]')).toBeVisible({ timeout: 60000 });
  await press(page, A);
  await expect(page.locator('[data-key="decision-continue"]')).toBeVisible({ timeout: 60000 });
  await press(page, A);

  // Debrief with the Choice Ledger; the mission-complete autosave is written.
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('debrief');
  await expect(page.locator('.gp-ledger__row')).toHaveCount(1);
  const done = await autoSave(page);
  expect(done?.completedMissions).toContain('sample-walk');
  expect(done?.resume.mission).toBeNull();
  expect(done?.archive).toContain('sample-letter');
  expect(done?.choices).toEqual({ 'sample-walk-share': 'archive' });

  // Quiz: Q1 answer is the second option (D-pad down), Q2 the first.
  await press(page, A);
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('quiz');
  await press(page, DOWN);
  await press(page, A);
  await expect(page.locator('[data-key="quiz-next"]')).toBeVisible({ timeout: 60000 });
  await press(page, A);
  await press(page, A);
  await expect(page.locator('[data-key="quiz-next"]')).toBeVisible({ timeout: 60000 });
  await press(page, A);
  await expect(page.locator('[data-key="quiz-finish"]')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.gp-stars')).toHaveText('★★★');
  await press(page, A);

  // Back at the hub: chapter complete is saved.
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('hub');
  await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 60000 });
  await expect.poll(() => autoSave(page).then((s) => s?.completedChapters ?? [])).toContain('sample');

  // Codex opens with the chapter's entries unlocked; back returns to the hub menu.
  await press(page, DOWN);
  await press(page, A);
  await expect(page.locator('[data-screen="gp-codex"]')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('[data-key="codex-sample-guide"]')).toBeVisible({ timeout: 60000 });
  await press(page, 1);
  await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 60000 });

  await page.waitForTimeout(300);
  expect(problems).toEqual([]);
});

test('continuing a save shows "Previously on" and resumes an exact mid-mission save', async ({ page }) => {
  test.setTimeout(180000);
  const problems = watchConsole(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('title');
  await gameplayReady(page);
  // Reach the mission through the director and walk a little, then pause and save manually.
  await page.evaluate(() => window.__netivim?.flow.send('openHub'));
  await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 60000 });
  await page.evaluate(() => window.__netivimGameplay?.beginChapter('sample', true));
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('briefing');
  await press(page, A);
  await expect.poll(() => missionState(page)).toBe('walk');
  await setStick(page, 0, -1);
  await page.waitForTimeout(600);
  await setStick(page, 0, 0);
  await page.evaluate(() => window.__netivim?.flow.setPaused(true));
  expect(await page.evaluate(() => window.__netivim?.save.saveManual('manual-1'))).toBe(true);
  const saved = await page.evaluate(() => window.__netivim?.save.load('manual-1')?.data.resume.mission ?? null);
  expect(saved?.missionId).toBe('sample-walk');
  const savedZ = (saved?.data as { level: { z: number } }).level.z;
  expect(savedZ).toBeGreaterThan(-6);

  await page.reload();
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('title');
  await gameplayReady(page);
  await press(page, A); // Continue
  await expect(page.locator('[data-screen="gp-recap"]')).toBeVisible({ timeout: 60000 });
  await press(page, A);
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('briefing');
  await expect(page.locator('[data-key="start-mission"]')).toHaveText(/המשך המשימה/);
  await press(page, A);
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('mission');
  const z = await page.evaluate(() => window.__netivimGameplay?.host?.level?.player?.z ?? null);
  expect(z).toBeCloseTo(savedZ, 1);
  await page.waitForTimeout(300);
  expect(problems).toEqual([]);
});
