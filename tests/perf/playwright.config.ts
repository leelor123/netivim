import { defineConfig, devices } from '@playwright/test';

/**
 * Performance and soak suites (headless Chromium, software WebGL: frame times are a RELATIVE
 * signal only; draw calls, triangles, programs, geometries, textures and heap are exact).
 *   npm run build:test && PW_PORT=4178 npx playwright test -c tests/perf/playwright.config.ts
 * The soak suite (tests/soak) runs with the same config: add `--grep soak` or pass the folder.
 */
const PORT = Number(process.env.PW_PORT ?? 4178);
// PERF_DIST=test-results/dist-perf serves an unminified test build (readable allocation sites):
//   npx vite build --mode test --outDir test-results/dist-perf --minify false
const DIST = process.env.PERF_DIST ?? 'dist-test';

export default defineConfig({
  testDir: '..',
  testMatch: ['perf/*.perf.ts', 'soak/*.soak.ts'],
  workers: 1,
  timeout: 900000,
  retries: 0,
  expect: { timeout: 60000 },
  reporter: [['list']],
  outputDir: '../../test-results/perf',
  use: {
    baseURL: 'http://localhost:' + String(PORT),
    launchOptions: {
      // Exact heap numbers (no 100 KB bucketing) and window.gc() for allocation checks.
      args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'],
    },
  },
  projects: [
    {
      name: 'android-landscape',
      // DPR 1 keeps software-GL frames short enough to sample; counts do not depend on resolution.
      use: { ...devices['Galaxy S9+ landscape'], deviceScaleFactor: 1, browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'npx vite preview --outDir ' + DIST + ' --port ' + String(PORT) + ' --strictPort',
    cwd: '../..',
    url: 'http://localhost:' + String(PORT),
    reuseExistingServer: false,
    timeout: 120000,
  },
});
