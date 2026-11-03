import { expect, test, type Page } from '@playwright/test';

/** Software-WebGL performance notes from the headless driver (same filter as core.spec.ts). */
const DRIVER_NOISE = /GL Driver Message \(OpenGL, Performance,/;

function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if ((msg.type() === 'error' || msg.type() === 'warning') && !DRIVER_NOISE.test(msg.text())) problems.push(msg.type() + ': ' + msg.text());
  });
  page.on('pageerror', (err) => problems.push('pageerror: ' + err.message));
  return problems;
}

async function bootWithWorld(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state)).toBe('title');
  await expect.poll(() => page.evaluate(() => window.__netivimWorld !== undefined)).toBe(true);
}

type Preset = 'battery' | 'low' | 'medium' | 'high' | 'ultra';

/** DESIGN.md section 8 budgets per preset. */
const BUDGET: Record<Preset, { calls: number; triangles: number }> = {
  battery: { calls: 120, triangles: 200_000 },
  low: { calls: 150, triangles: 300_000 },
  medium: { calls: 250, triangles: 600_000 },
  high: { calls: 400, triangles: 1_500_000 },
  ultra: { calls: 600, triangles: 3_000_000 },
};

interface Stats {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
}

/** Builds a world scene in the page, shows it for a moment and returns renderer.info. */
async function showScene(page: Page, kind: 'hub' | 'sample', preset: Preset, vegetation?: number): Promise<Stats> {
  return page.evaluate(
    async ({ kind, preset, vegetation }) => {
      const world = window.__netivimWorld;
      const game = window.__netivim;
      if (!world || !game) throw new Error('test hooks missing');
      const base = world.qualityFor(preset);
      const quality = vegetation === undefined ? base : { ...base, vegetation };
      const next = kind === 'hub' ? await world.createHubScene({ quality }) : await world.createSampleScene({ quality });
      game.scenes.switchTo(next);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const info = game.renderer.info;
      return {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
      };
    },
    { kind, preset, vegetation },
  );
}

test.describe('world scenes', () => {
  test.describe.configure({ timeout: 240_000 });

  test('the game flow opens the Archive hub', async ({ page }) => {
    const problems = watchConsole(page);
    await bootWithWorld(page);
    await page.evaluate(() => window.__netivim?.flow.send('openHub'));
    await expect
      .poll(() => page.evaluate(() => window.__netivim?.scenes.active?.scene.getObjectByName('relief-map') !== undefined), { timeout: 30_000 })
      .toBe(true);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test-results/world/hub-flow.png' });
    expect(problems).toEqual([]);
  });

  test('hub stays within the draw-call and triangle budget at every preset', async ({ page }) => {
    const problems = watchConsole(page);
    await bootWithWorld(page);
    for (const preset of ['battery', 'low', 'medium', 'high', 'ultra'] as const) {
      const stats = await showScene(page, 'hub', preset);
      console.log('[world] hub ' + preset + ': ' + JSON.stringify(stats));
      await page.screenshot({ path: 'test-results/world/hub-' + preset + '.png' });
      expect(stats.calls).toBeGreaterThan(0);
      expect(stats.calls).toBeLessThanOrEqual(BUDGET[preset].calls);
      expect(stats.triangles).toBeLessThanOrEqual(BUDGET[preset].triangles);
    }
    expect(problems).toEqual([]);
  });

  test('1948 hills-and-road scene stays within budget at every vegetation level', async ({ page }) => {
    const problems = watchConsole(page);
    await bootWithWorld(page);
    for (const vegetation of [0, 0.25, 0.5, 0.75, 1]) {
      const stats = await showScene(page, 'sample', 'high', vegetation);
      console.log('[world] sample high veg=' + String(vegetation) + ': ' + JSON.stringify(stats));
      await page.screenshot({ path: 'test-results/world/sample-veg-' + String(vegetation) + '.png' });
      expect(stats.calls).toBeLessThanOrEqual(BUDGET.high.calls);
      expect(stats.triangles).toBeLessThanOrEqual(BUDGET.high.triangles);
    }
    for (const preset of ['battery', 'low'] as const) {
      const stats = await showScene(page, 'sample', preset);
      console.log('[world] sample ' + preset + ': ' + JSON.stringify(stats));
      expect(stats.calls).toBeLessThanOrEqual(BUDGET[preset].calls);
      expect(stats.triangles).toBeLessThanOrEqual(BUDGET[preset].triangles);
    }
    expect(problems).toEqual([]);
  });

  test('switching scenes repeatedly keeps GPU memory flat', async ({ page }) => {
    const problems = watchConsole(page);
    await bootWithWorld(page);
    const first = await showScene(page, 'hub', 'high');
    await showScene(page, 'sample', 'high');
    await showScene(page, 'hub', 'high');
    await showScene(page, 'sample', 'high');
    const again = await showScene(page, 'hub', 'high');
    expect(again.geometries).toBe(first.geometries);
    expect(again.textures).toBe(first.textures);
    expect(problems).toEqual([]);
  });
});
