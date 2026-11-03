import { defineConfig, devices } from '@playwright/test';

/**
 * Visual baselines for the graphics presets (title scene). Run after `npm run build:test`:
 *   npx playwright test -c tests/visual/playwright.config.ts
 * Update baselines (review every image for acne, peter-panning, z-fighting, aliasing, banding):
 *   npx playwright test -c tests/visual/playwright.config.ts --update-snapshots
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.visual.ts',
  workers: 1,
  timeout: 300000,
  retries: 0,
  expect: { timeout: 150000 },
  reporter: [['list']],
  snapshotPathTemplate: '{testDir}/baselines/{arg}{ext}',
  use: {
    baseURL: 'http://localhost:4175',
  },
  projects: [
    {
      name: 'android-landscape',
      // Phone-like landscape at a modest DPR: software WebGL in CI renders Ultra (GTAO, MSAA,
      // SMAA, bloom, shafts) at full 1.5x quickly enough to compare stable frames.
      use: { ...devices['Galaxy S9+ landscape'], viewport: { width: 960, height: 444 }, deviceScaleFactor: 1.5, browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'npx vite preview --outDir dist-test --port 4175 --strictPort',
    cwd: '../..',
    url: 'http://localhost:4175',
    // Never reuse: parallel worktrees may serve their own build on this port.
    reuseExistingServer: false,
    timeout: 180000,
  },
});
