import { expect, test, type Page } from '@playwright/test';
import type { GraphicsPreset } from '../../src/core/settings';

/** Same driver-noise rule as core.spec.ts: only the software GL driver's own perf notes. */
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
  await expect.poll(() => page.evaluate(() => window.__netivimGraphics !== undefined)).toBe(true);
}

/** Resolves after n frames rendered by the pipeline. */
async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        const pipeline = window.__netivimGraphics?.pipeline;
        if (!pipeline) throw new Error('no pipeline');
        let seen = 0;
        const off = pipeline.addFrameListener(() => {
          if (++seen >= count) {
            off();
            resolve();
          }
        });
      }),
    n,
  );
}

async function applyPreset(page: Page, preset: GraphicsPreset): Promise<void> {
  await page.evaluate((p) => {
    window.__netivimGraphics?.setAdaptiveEnabled(false);
    window.__netivim?.settings.update('graphics', { mode: 'preset', preset: p });
  }, preset);
  await expect.poll(() => page.evaluate(() => window.__netivimGraphics?.pipeline.ready)).toBe(true);
  await frames(page, 2);
}

/** DESIGN 8 per-frame budgets (whole frame: shadow pass + scene + post passes). */
const BUDGETS: Readonly<Record<GraphicsPreset, { calls: number; triangles: number }>> = {
  battery: { calls: 120, triangles: 200_000 },
  low: { calls: 150, triangles: 300_000 },
  medium: { calls: 250, triangles: 600_000 },
  high: { calls: 400, triangles: 1_500_000 },
  ultra: { calls: 600, triangles: 3_000_000 },
};

test('every preset applies live and stays within its DESIGN budget on the title scene', async ({ page }) => {
  test.setTimeout(300_000);
  const problems = watchConsole(page);
  await bootToTitle(page);
  // Marker survives only if no reload happens while switching presets.
  await page.evaluate(() => {
    (window as unknown as { liveMarker: number }).liveMarker = 42;
  });
  const results: Record<string, unknown> = {};
  for (const preset of ['battery', 'low', 'medium', 'high', 'ultra'] as const) {
    await applyPreset(page, preset);
    const s = await page.evaluate(() => {
      const p = window.__netivimGraphics?.pipeline;
      if (!p) throw new Error('no pipeline');
      return { ...p.stats, preset: p.resolved.preset, shadowMap: p.renderer.shadowMap.enabled, toneMapping: p.renderer.toneMapping, colorSpace: p.renderer.outputColorSpace };
    });
    results[preset] = { calls: s.calls, triangles: s.triangles, composer: s.composer, pixelRatio: s.pixelRatio };
    expect(s.preset).toBe(preset);
    expect(s.calls).toBeGreaterThan(0);
    expect(s.calls).toBeLessThanOrEqual(BUDGETS[preset].calls);
    expect(s.triangles).toBeLessThanOrEqual(BUDGETS[preset].triangles);
    // AgX tone mapping (THREE.AgXToneMapping = 6) and sRGB output on every preset.
    expect(s.toneMapping).toBe(6);
    expect(s.colorSpace).toBe('srgb');
    // EffectComposer only when a post effect is on: Battery Saver renders straight to the canvas.
    expect(s.composer).toBe(preset !== 'battery');
    expect(s.shadowMap).toBe(preset === 'medium' || preset === 'high' || preset === 'ultra');
    expect(s.pixelRatio).toBeLessThanOrEqual(2);
  }
  console.log('[graphics budgets]', JSON.stringify(results));
  expect(await page.evaluate(() => (window as unknown as { liveMarker?: number }).liveMarker)).toBe(42);
  // Ultra is native resolution capped at 2x; Battery Saver renders well below it.
  const ultraRatio = (results.ultra as { pixelRatio: number }).pixelRatio;
  expect(ultraRatio).toBe(2);
  expect((results.battery as { pixelRatio: number }).pixelRatio).toBeLessThan(ultraRatio);
  expect(problems).toEqual([]);
});

test('the debug overlay shows live numbers and hides again', async ({ page }) => {
  const problems = watchConsole(page);
  await bootToTitle(page);
  await applyPreset(page, 'low');
  await page.evaluate(() => window.__netivim?.settings.update('graphics', { debugOverlay: true }));
  const overlay = page.locator('[data-testid="graphics-debug"]');
  await expect(overlay).toBeVisible();
  for (const field of ['fps', 'drawCalls', 'triangles', 'geometries', 'textures']) {
    await expect(overlay.locator(`[data-field="${field}"] .gfx-debug-value`)).toHaveText(/^\d+$/);
  }
  await expect(overlay.locator('[data-field="frameTime"] .gfx-debug-value')).toHaveText(/^\d+\.\d$/);
  await expect(overlay.locator('[data-field="preset"] .gfx-debug-value')).toHaveText('נמוכה');
  await page.evaluate(() => window.__netivim?.settings.update('graphics', { debugOverlay: false }));
  await expect(overlay).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('a lost WebGL context is restored: render targets rebuilt, rendering resumes', async ({ page }) => {
  test.setTimeout(120_000);
  const problems = watchConsole(page);
  await bootToTitle(page);
  await applyPreset(page, 'high');
  await page.evaluate(() => {
    const gl = window.__netivim?.renderer.getContext();
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (!ext) throw new Error('no WEBGL_lose_context');
    (window as unknown as { loseExt: WEBGL_lose_context }).loseExt = ext;
    ext.loseContext();
  });
  await expect.poll(() => page.evaluate(() => window.__netivimGraphics?.pipeline.contextLost)).toBe(true);
  await page.evaluate(() => (window as unknown as { loseExt: WEBGL_lose_context }).loseExt.restoreContext());
  await expect.poll(() => page.evaluate(() => window.__netivimGraphics?.pipeline.contextLost)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__netivimGraphics?.pipeline.ready)).toBe(true);
  await frames(page, 3);
  const s = await page.evaluate(() => window.__netivimGraphics?.pipeline.stats);
  expect(s?.composer).toBe(true);
  expect(s?.calls).toBeGreaterThan(0);
  await expect(page.locator('.gfx-context-lost')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('Auto mode benchmarks once on first launch and stores the result', async ({ page }) => {
  const problems = watchConsole(page);
  await bootToTitle(page);
  const before = await page.evaluate(() => window.__netivim?.settings.value.graphics);
  expect(before?.mode).toBe('auto');
  // The benchmark is bounded (under 3 s of frames, plus the frame in flight).
  await expect.poll(() => page.evaluate(() => window.__netivim?.settings.value.graphics.benchmarked), { timeout: 20_000 }).toBe(true);
  const after = await page.evaluate(() => ({
    g: window.__netivim?.settings.value.graphics,
    running: window.__netivimGraphics?.benchmarkRunning,
    notice: window.__netivimGraphics?.lastNotice?.textKey,
    preset: window.__netivimGraphics?.pipeline.resolved.preset,
  }));
  expect(after.running).toBe(false);
  expect(after.g?.mode).toBe('auto');
  expect(after.preset).toBe(after.g?.preset);
  expect(after.notice).toBe('graphics.toast.benchmarkDone');
  // Second launch: no new benchmark.
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state)).toBe('title');
  expect(await page.evaluate(() => window.__netivimGraphics?.benchmarkRunning)).toBe(false);
  expect(problems).toEqual([]);
});

test('Custom with every effect (motion blur, AO, MSAA, DoF) compiles and renders cleanly', async ({ page }) => {
  test.setTimeout(180_000);
  const problems = watchConsole(page);
  await bootToTitle(page);
  await page.evaluate(() => {
    const g = window.__netivim;
    window.__netivimGraphics?.setAdaptiveEnabled(false);
    if (!g) throw new Error('no test hook');
    g.settings.update('graphics', {
      mode: 'custom',
      custom: {
        ...g.settings.value.graphics.custom,
        resolutionScale: 0.5,
        antialias: 'msaa',
        shadows: 'low',
        ambientOcclusion: true,
        bloom: true,
        fog: true,
        colorGrading: true,
        depthOfField: true,
        motionBlur: true,
      },
    });
  });
  await expect.poll(() => page.evaluate(() => window.__netivimGraphics?.pipeline.ready)).toBe(true);
  // Cinematics API: depth of field on, refocus, off. No chain rebuild, no errors.
  await page.evaluate(() => window.__netivimGraphics?.pipeline.setDepthOfField(18, 0.03));
  await frames(page, 2);
  expect(await page.evaluate(() => window.__netivimGraphics?.pipeline.depthOfFieldActive)).toBe(true);
  await page.evaluate(() => window.__netivimGraphics?.pipeline.setDepthOfField(9, 0.02, 0.01));
  await frames(page, 2);
  await page.evaluate(() => window.__netivimGraphics?.pipeline.clearDepthOfField());
  await frames(page, 2);
  const s = await page.evaluate(() => {
    const p = window.__netivimGraphics?.pipeline;
    return { dof: p?.depthOfFieldActive, preset: p?.resolved.preset, composer: p?.stats.composer };
  });
  expect(s).toEqual({ dof: false, preset: null, composer: true });
  expect(problems).toEqual([]);
});
