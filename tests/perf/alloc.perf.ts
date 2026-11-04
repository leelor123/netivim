import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect, type CDPSession, type Page } from '@playwright/test';
import { boot, enterHub, enterMission, MISSIONS, setPreset, watchConsole } from './helpers';

/**
 * Per-frame allocations (BRIEF 6: "no allocations in the loop"). The V8 sampling heap profiler
 * records every sampled allocation, including objects already collected by minor/major GC, while
 * the game renders and simulates on its own (rAF). Bytes per frame = sampled bytes / frames.
 * Run against an unminified build to read the sites:
 *   npx vite build --mode test --outDir test-results/dist-perf --minify false
 *   PERF_DIST=test-results/dist-perf PW_PORT=4178 npx playwright test -c tests/perf/playwright.config.ts alloc
 * Report: test-results/perf/alloc.json (top sites per scene).
 */

interface ProfileNode {
  callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number };
  selfSize: number;
  children: ProfileNode[];
}

/** Target per frame for everything (game + three.js); reported, see PERF_REPORT for owners. */
const MAX_BYTES_PER_FRAME = Number(process.env.PERF_MAX_BYTES_PER_FRAME ?? 2048);
/** getProgram() parameter + cache-key rebuilds: the render-side allocation this suite guards. */
const PROGRAM_CHURN = /getProgram|getParameters|getProgramCacheKey/;
const MAX_CHURN_BYTES_PER_FRAME = 256;
const WINDOW_MS = Number(process.env.PERF_ALLOC_MS ?? 4000);

// A small canvas: software GL then renders enough frames for the JIT to optimize the hot paths
// (unoptimized code boxes every double and would report allocations a phone never sees).
test.use({ viewport: { width: 480, height: 240 } });

/** Runs simulation steps flat out so the JIT optimizes the step code before sampling. */
async function warmJit(page: Page, steps: number): Promise<void> {
  await page.evaluate((n) => {
    const g = window.__netivim;
    for (let i = 0; i < n; i++) g?.loop.advance(1 / 60);
  }, steps);
}

async function profile(cdp: CDPSession, page: Page, ms: number): Promise<{ bytesPerFrame: number; frames: number; top: { site: string; bytes: number }[] }> {
  await warmJit(page, 1200);
  await page.waitForTimeout(3000);
  await cdp.send('HeapProfiler.collectGarbage');
  const startFrames = await page.evaluate(() => (window as unknown as { __perfRec: { count: number } }).__perfRec.count);
  await cdp.send('HeapProfiler.startSampling', {
    samplingInterval: 256,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
  await page.waitForTimeout(ms);
  const { profile: prof } = (await cdp.send('HeapProfiler.stopSampling')) as unknown as { profile: { head: ProfileNode } };
  const frames = (await page.evaluate(() => (window as unknown as { __perfRec: { count: number } }).__perfRec.count)) - startFrames;
  const sites = new Map<string, number>();
  let total = 0;
  const walk = (n: ProfileNode, stack: string): void => {
    const cf = n.callFrame;
    const file = cf.url.split('/').pop() ?? '';
    const here = (cf.functionName || '(anon)') + ' ' + file + ':' + String(cf.lineNumber + 1);
    // Only the game page counts (Playwright's evaluate glue and the profiler itself do not).
    const ours = cf.url.includes('/assets/') || stack !== '';
    if (n.selfSize > 0 && ours) {
      const key = stack ? stack + ' <- ' + here : here;
      sites.set(key, (sites.get(key) ?? 0) + n.selfSize);
      total += n.selfSize;
    }
    for (const c of n.children) walk(c, cf.url.includes('/assets/') ? here : stack);
  };
  walk(prof.head, '');
  const top = [...sites.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([site, bytes]) => ({ site, bytes }));
  return { bytesPerFrame: frames > 0 ? total / frames : 0, frames, top };
}

test('per-frame allocations: hub and the five missions', async ({ page }) => {
  const problems = watchConsole(page);
  await boot(page);
  // PERF_ALLOC_PRESET=ultra adds the post chain to the measured path.
  await setPreset(page, (process.env.PERF_ALLOC_PRESET ?? 'medium') as 'medium');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  const results: Record<string, Awaited<ReturnType<typeof profile>>> = {};
  await enterHub(page);
  results.hub = await profile(cdp, page, WINDOW_MS);
  for (const m of MISSIONS) {
    await enterMission(page, m);
    results[m.key] = await profile(cdp, page, WINDOW_MS);
  }
  mkdirSync('test-results/perf', { recursive: true });
  writeFileSync('test-results/perf/alloc.json', JSON.stringify(results, null, 2));
  for (const [scene, r] of Object.entries(results)) {
    console.log(scene, 'frames', r.frames, 'bytes/frame', r.bytesPerFrame.toFixed(0));
    for (const t of r.top.slice(0, 6)) console.log('   ', t.bytes, t.site);
  }
  for (const [scene, r] of Object.entries(results)) {
    expect.soft(r.frames, scene + ' rendered frames').toBeGreaterThan(5);
    // Render path: three.js must never re-derive programs per frame (program churn), in every
    // scene (two-pass transparent DoubleSide meshes and one material shared by instanced and
    // plain meshes both cause it; see docs/PERF_REPORT.md).
    const churn = r.top.filter((t) => PROGRAM_CHURN.test(t.site)).reduce((a, t) => a + t.bytes, 0) / Math.max(1, r.frames);
    expect.soft(churn, scene + ' program-churn bytes per frame').toBeLessThanOrEqual(MAX_CHURN_BYTES_PER_FRAME);
    if (r.bytesPerFrame > MAX_BYTES_PER_FRAME) console.log('OVER per-frame allocation target', scene, r.bytesPerFrame.toFixed(0), 'B/frame (see PERF_REPORT)');
  }
  expect(problems).toEqual([]);
});
