import { expect, test, type Page } from '@playwright/test';

/**
 * Bug hunt M2 regressions at a phone viewport with touch (no controller): chapter cutscenes are
 * registered when a chapter is opened from the timeline (not only from "Continue"), and leaving a
 * mission to the hub silences its sustained audio. Zero console problems.
 */

const DRIVER_NOISE = /GL Driver Message \(OpenGL, Performance,/;

test.use({ viewport: { width: 1170, height: 540 }, hasTouch: true, isMobile: true });

function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if ((msg.type() === 'error' || msg.type() === 'warning') && !DRIVER_NOISE.test(msg.text())) problems.push(msg.type() + ': ' + msg.text());
  });
  page.on('pageerror', (err) => problems.push('pageerror: ' + err.message));
  return problems;
}

test('opening a chapter registers its cutscenes, and the mission cutscene really plays', async ({ page }) => {
  test.setTimeout(180000);
  const problems = watchConsole(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 60000 }).toBe('title');
  await expect.poll(() => page.evaluate(() => !!window.__netivimGameplay && !!window.__netivimCinematics), { timeout: 45000 }).toBe(true);
  await page.evaluate(() => window.__netivim?.settings.update('graphics', { mode: 'preset', preset: 'low' }));
  await page.evaluate(() => window.__netivim?.flow.send('openHub'));
  await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 60000 });

  expect(await page.evaluate(() => window.__netivimCinematics?.has('ch00.opening'))).toBe(false);
  // The timeline path (new game), not the Continue path.
  await page.evaluate(() => window.__netivimGameplay?.beginChapter('prologue', false));
  await expect(page.locator('[data-screen="gp-briefing"]')).toBeVisible({ timeout: 60000 });
  expect(await page.evaluate(() => window.__netivimCinematics?.has('ch00.opening'))).toBe(true);

  // Finish Archive at Night: its opening cutscene plays before the debrief.
  await page.locator('[data-key="start-mission"]').tap();
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 60000 }).toBe('mission');
  await page.evaluate(() => {
    const h = window.__netivimGameplay?.host;
    if (!h) return;
    for (let i = 0; i < 20 && h.phase !== 'complete'; i++) {
      const next = Object.keys(h.def.mission.machine.transitions[h.state] ?? {})[0];
      if (next) h.send(next);
    }
  });
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 30000 }).toBe('cutscene');
  await page.evaluate(() => window.__netivimCinematics?.player.skip());
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 30000 }).toBe('debrief');
  expect(problems).toEqual([]);
});

test('leaving a mission to the hub stops the level ambience', async ({ page }) => {
  test.setTimeout(180000);
  const problems = watchConsole(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 60000 }).toBe('title');
  await expect.poll(() => page.evaluate(() => !!window.__netivimGameplay), { timeout: 45000 }).toBe(true);
  await page.evaluate(() => window.__netivim?.settings.update('graphics', { mode: 'preset', preset: 'low' }));
  const cues: string[] = [];
  await page.exposeFunction('__bhCue', (c: string) => cues.push(c));
  await page.evaluate(() => window.__netivim?.bus.on('audio:cue', ({ cue }) => void (window as unknown as { __bhCue: (c: string) => void }).__bhCue(cue)));
  await page.evaluate(() => window.__netivim?.flow.send('openHub'));
  await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 60000 });
  await page.evaluate(() => window.__netivimGameplay?.beginChapter('prologue', false));
  await page.locator('[data-key="start-mission"]').tap({ timeout: 60000 });
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 60000 }).toBe('mission');
  await expect.poll(() => cues.some((c) => c.startsWith('ambience.') && c !== 'ambience.none')).toBe(true);
  await page.evaluate(() => window.__netivim?.flow.send('abandon'));
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 30000 }).toBe('hub');
  // Leaving the title too forces the scene switch that disposes the level.
  await page.evaluate(() => window.__netivim?.flow.send('toTitle'));
  await expect.poll(() => cues.filter((c) => c.startsWith('ambience.')).pop()).toBe('ambience.none');
  expect(problems).toEqual([]);
});
