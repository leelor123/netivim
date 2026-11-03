import { expect, test, type Page } from '@playwright/test';

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

async function boot(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state)).toBe('title');
  await expect.poll(() => page.evaluate(() => window.__netivimAudio !== undefined)).toBe(true);
}

const audioState = (page: Page): Promise<string | undefined> => page.evaluate(() => window.__netivimAudio?.engine.state);

test('audio stays asleep until a gesture, then the AudioContext runs', async ({ page }) => {
  const problems = watchConsole(page);
  await boot(page);
  expect(await audioState(page)).toBe('none');
  // Cues before any gesture are ignored quietly.
  await page.evaluate(() => window.__netivim?.bus.emit('audio:cue', { cue: 'ui.confirm' }));
  expect(await audioState(page)).toBe('none');
  await page.keyboard.press('Space');
  await expect.poll(() => audioState(page)).toBe('running');
  expect(problems).toEqual([]);
});

test('cues, beds and mood changes cause no console errors', async ({ page }) => {
  const problems = watchConsole(page);
  await boot(page);
  await page.keyboard.press('Space');
  await expect.poll(() => audioState(page)).toBe('running');
  await page.evaluate(() => {
    const g = window.__netivim;
    if (!g) throw new Error('no test hook');
    const cues = [
      'ui.move', 'ui.confirm', 'ui.back', 'ui.toggle', 'ui.save', 'ui.error', 'wind', 'sea', 'engine.truck', 'engine.ship',
      'footsteps.sand', 'footsteps.stone', 'crowd.murmur', 'birds', 'crickets', 'siren.alert', 'distant.rumble', 'radio.static',
      'typewriter', 'paper.rustle', 'interception.whoosh', 'ambience.desert', 'ambience.sea', 'ambience.city', 'ambience.village',
      'ambience.interior', 'ambience.night', 'music.title',
    ];
    for (const cue of cues) g.bus.emit('audio:cue', { cue, intensity: 0.7 });
    for (const mood of ['calm', 'tense', 'reflective', 'hopeful'] as const) g.bus.emit('audio:mood', { mood, era: 1948 });
    g.bus.emit('audio:mood', { mood: 'calm', era: 1895 });
    g.bus.emit('audio:mood', { mood: 'hopeful', era: 2024 });
    g.settings.update('accessibility', { contentIntensity: 'gentle' });
    g.bus.emit('audio:cue', { cue: 'siren.alert' });
    g.settings.update('audio', { master: 0.4, music: 0.5 });
    g.bus.emit('subtitle:show', { textKey: 'app.title', speakerKey: null, durationMs: 1000, voice: true });
    g.bus.emit('subtitle:clear', {});
  });
  await page.waitForTimeout(1500);
  const sys = await page.evaluate(() => ({
    layers: window.__netivimAudio?.score.layerCount ?? 0,
    master: window.__netivimAudio?.engine.buses?.master.gain.value ?? 0,
    voices: window.__netivimAudio?.engine.limiter.active ?? 0,
  }));
  expect(sys.layers).toBeGreaterThan(0);
  expect(sys.layers).toBeLessThanOrEqual(3);
  expect(sys.master).toBeGreaterThan(0);
  expect(sys.voices).toBeLessThanOrEqual(20);
  expect(await audioState(page)).toBe('running');
  expect(problems).toEqual([]);
});

test('pausing suspends the AudioContext and resuming restores it', async ({ page }) => {
  const problems = watchConsole(page);
  await boot(page);
  await page.keyboard.press('Space');
  await expect.poll(() => audioState(page)).toBe('running');
  await page.evaluate(() => window.__netivim?.flow.setPaused(true));
  await expect.poll(() => audioState(page)).toBe('suspended');
  await page.evaluate(() => window.__netivim?.flow.setPaused(false));
  await expect.poll(() => audioState(page)).toBe('running');
  expect(problems).toEqual([]);
});
