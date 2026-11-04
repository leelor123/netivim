import { expect, test, type Page } from '@playwright/test';
import type { BotStep } from '../../src/gameplay/types';

/**
 * Night Landing E2E, controller only: the page sees nothing but a mocked gamepad. A QA pilot reads
 * the level's own bot script and turns each step into stick and button states, one fixed
 * simulation step at a time (game.loop.advance), so the whole mission runs in a few seconds even on
 * software WebGL. Checks: briefing, objective text, the danger meter, a soft fail with its failure
 * card and instant retry, the whole mission through to the debrief, the render budget on the beach,
 * and zero console errors or warnings.
 *
 * The chapter module (ch01) is registered by the chapter builder; until it is merged this test
 * skips itself instead of failing.
 */

const DRIVER_NOISE = /GL Driver Message \(OpenGL, Performance,/;
const A = 0;

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

const isDown = (page: Page, action: string): Promise<boolean> => page.evaluate((a) => window.__netivim?.input.isDown(a as 'confirm') ?? false, action);

/** One confirm press, held until a simulation step has seen it (software WebGL can be slow). */
async function pressConfirm(page: Page): Promise<void> {
  await setButton(page, A, true);
  await expect.poll(() => isDown(page, 'confirm'), { timeout: 30000 }).toBe(true);
  await setButton(page, A, false);
  await expect.poll(() => isDown(page, 'confirm'), { timeout: 30000 }).toBe(false);
  await page.waitForTimeout(250);
}

const flowState = (page: Page): Promise<string | undefined> => page.evaluate(() => window.__netivim?.flow.state);
const missionState = (page: Page): Promise<string | undefined> => page.evaluate(() => window.__netivimGameplay?.host?.state);

interface DriveResult {
  readonly state: string;
  readonly phase: string;
  readonly sim: number;
  readonly sawMeter: boolean;
  readonly sawPrompt: boolean;
}

/**
 * Drives the mission with the mocked gamepad only. Without `steps` it follows the level's bot
 * script for the current checkpoint (restarting it on every new checkpoint); with `steps` it runs
 * exactly those. Stops at `until` (a mission state), on failure/completion, or after `maxSeconds`.
 */
async function drive(page: Page, o: { until?: string; steps?: readonly BotStep[]; maxSeconds: number }): Promise<DriveResult> {
  return page.evaluate((opts) => {
    const g = window.__netivim;
    const gp = window.__netivimGameplay;
    const pad = (window as unknown as { __pad: PadState }).__pad;
    if (!g || !gp) throw new Error('test hooks missing');
    const DT = 1 / 60;
    let cp = '';
    let queue: BotStep[] = opts.steps ? [...opts.steps] : [];
    let stepT = 0;
    let sim = 0;
    let sawMeter = false;
    let sawPrompt = false;
    const press = (on: boolean): void => {
      const b = pad.buttons[2];
      if (b) {
        b.pressed = on;
        b.value = on ? 1 : 0;
      }
    };
    for (let i = 0; i < opts.maxSeconds * 60; i++) {
      const host = gp.host;
      if (!host || g.flow.state !== 'mission' || host.phase === 'failed' || host.phase === 'complete') break;
      if (opts.until && host.state === opts.until) break;
      if (!opts.steps && host.checkpoint !== cp) {
        cp = host.checkpoint;
        queue = [...((host.def.botScript as Record<string, readonly BotStep[]>)[cp] ?? [])];
        stepT = 0;
      }
      pad.axes[0] = 0;
      pad.axes[1] = 0;
      press(false);
      const step = queue[0];
      const p = host.level?.player;
      let done = false;
      if (step && p) {
        stepT += DT;
        if (step.kind === 'walkTo') {
          const dx = step.x - p.x;
          const dz = step.z - p.z;
          const d = Math.hypot(dx, dz);
          if (d <= (step.within ?? 0.6)) done = true;
          else {
            const yaw = p.cameraYaw;
            const fwd = (dx / d) * Math.sin(yaw) + (dz / d) * Math.cos(yaw);
            const right = (dx / d) * -Math.cos(yaw) + (dz / d) * Math.sin(yaw);
            const s = Math.min(1, d / 1.5);
            pad.axes[0] = right * s;
            pad.axes[1] = -fwd * s;
          }
        } else if (step.kind === 'wait') done = stepT >= step.seconds;
        else if (step.kind === 'press') {
          press(true);
          done = true;
        } else if (step.kind === 'waitFor') done = host.state === step.state;
      }
      g.loop.advance(DT);
      sim += DT;
      if (document.querySelector('.gp-hud__meter:not([hidden])')) sawMeter = true;
      if (document.querySelector('.gp-hud__prompt:not([hidden])')) sawPrompt = true;
      if (done) {
        queue.shift();
        stepT = 0;
      }
    }
    pad.axes[0] = 0;
    pad.axes[1] = 0;
    press(false);
    const host = gp.host;
    return { state: host?.state ?? 'none', phase: host?.phase ?? 'none', sim, sawMeter, sawPrompt };
  }, o);
}

test('Night Landing: controller-only QA pilot, soft fail with retry, then the whole mission to the debrief', async ({ page }) => {
  test.setTimeout(300000);
  const problems = watchConsole(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('title');
  await expect.poll(() => page.evaluate(() => !!window.__netivimGameplay), { timeout: 45000 }).toBe(true);
  await expect(page.locator('[data-ui-screen="title"]')).toBeVisible({ timeout: 60000 });

  // Make Night Landing the next mission of Chapter 1 (the first one is marked done).
  await page.evaluate(() => {
    const g = window.__netivim;
    if (!g) return;
    const s = g.getState();
    g.setState({ ...s, completedMissions: [...s.completedMissions, 'tower-and-stockade'] });
    g.flow.send('openHub');
  });
  await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 60000 });
  await page.evaluate(() => window.__netivimGameplay?.beginChapter('ch01', false));
  const note = page.locator('[data-screen="gp-content-note"]');
  const noteShown = await note
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!noteShown, 'chapter ch01 is not registered yet (the chapter builder adds it)');
  problems.length = 0;

  await pressConfirm(page);
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('briefing');
  await expect(page.locator('[data-screen="gp-briefing"]')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('[data-screen="gp-briefing"]')).toContainText('נחיתת לילה');
  await expect(page.locator('.gp-map')).toBeVisible();
  await pressConfirm(page);
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('mission');
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('sea');
  await expect(page.locator('.gp-hud__objective')).toHaveText('הפליגו אל הפנס שעל המים, הרחק מסירת הסיור הרחוקה.');

  // Phase 1: the boat sails to the lantern with the vehicle camera, steered by the stick alone.
  const sea = await drive(page, { until: 'patrols', maxSeconds: 90 });
  expect(sea.state).toBe('patrols');
  expect(await page.evaluate(() => window.__netivimGameplay?.host?.level?.player?.x)).toBeLessThan(-100);
  await expect(page.locator('.gp-hud__objective')).toHaveText('המתינו שסירת הסיור תעבור, ורק אז אותתו לספינה.');

  // A soft fail: parking in front of the patrol lane fills the danger meter until the boat is seen.
  const seen = await drive(page, { steps: [{ kind: 'walkTo', x: -146, z: 66, within: 3 }, { kind: 'wait', seconds: 90 }], maxSeconds: 120 });
  expect(seen.phase).toBe('failed');
  expect(seen.sawMeter).toBe(true);
  await expect(page.locator('.gp-sheet--failure')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.gp-sheet--failure')).toContainText('מה קרה באמת');
  await expect(page.locator('.gp-sheet--failure')).toContainText('מעל 90 אחוז');
  // Instant retry from the checkpoint (no hint or assist offered after a single failure).
  await pressConfirm(page);
  await expect.poll(() => page.evaluate(() => window.__netivimGameplay?.host?.phase), { timeout: 30000 }).toBe('running');
  expect(await missionState(page)).toBe('patrols');

  // Then the whole rest of the mission: patrols, searchlights, landing, escort, hollow.
  const rest = await drive(page, { maxSeconds: 700 });
  expect(rest.phase, 'state ' + rest.state).toBe('complete');
  expect(rest.sawPrompt).toBe(true);
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('debrief');
  const save = await page.evaluate(() => {
    const s = window.__netivim?.save.load('auto');
    return s ? { done: s.data.completedMissions, codex: s.data.unlocks.codex, testimonies: s.data.unlocks.testimonies } : null;
  });
  expect(save?.done).toContain('night-landing');
  expect(save?.codex).toContain('white-paper');
  expect(save?.testimonies).toContain('passenger');

  await page.waitForTimeout(300);
  expect(problems).toEqual([]);
});

test('Night Landing: the beach scene stays inside the Ultra render budget', async ({ page }) => {
  test.setTimeout(300000);
  const problems = watchConsole(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('title');
  await expect.poll(() => page.evaluate(() => !!window.__netivimGameplay), { timeout: 45000 }).toBe(true);
  await page.evaluate(() => {
    const g = window.__netivim;
    if (!g) return;
    window.__netivimGraphics?.setAdaptiveEnabled(false);
    g.settings.update('graphics', { mode: 'preset', preset: 'ultra' });
    const s = g.getState();
    g.setState({ ...s, completedMissions: [...s.completedMissions, 'tower-and-stockade'] });
    g.flow.send('openHub');
  });
  await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 60000 });
  await page.evaluate(() => window.__netivimGameplay?.beginChapter('ch01', false));
  const noteShown = await page
    .locator('[data-screen="gp-content-note"]')
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!noteShown, 'chapter ch01 is not registered yet (the chapter builder adds it)');
  problems.length = 0;
  await pressConfirm(page);
  await expect.poll(() => flowState(page), { timeout: 60000 }).toBe('briefing');
  await pressConfirm(page);
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('sea');
  // Fast-forward to the beach (shore checkpoint reached by the bot), then let frames render.
  await drive(page, { until: 'shore', maxSeconds: 700 });
  expect(await missionState(page)).toBe('shore');
  await expect.poll(() => page.evaluate(() => window.__netivimGraphics?.pipeline.ready), { timeout: 60000 }).toBe(true);
  await page.waitForTimeout(1500);
  const stats = await page.evaluate(() => {
    const p = window.__netivimGraphics?.pipeline;
    return p ? { calls: p.stats.calls, triangles: p.stats.triangles, preset: p.resolved.preset } : null;
  });
  expect(stats?.preset).toBe('ultra');
  expect(stats?.calls ?? 0).toBeGreaterThan(0);
  expect(stats?.calls ?? 9999).toBeLessThanOrEqual(600);
  expect(stats?.triangles ?? 9e9).toBeLessThanOrEqual(3_000_000);
  expect(problems).toEqual([]);
});
