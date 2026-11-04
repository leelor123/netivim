import { defineConfig, devices } from '@playwright/test';

// Parallel worktrees can set PW_PORT to avoid clashing on the default port.
const PORT = Number(process.env.PW_PORT ?? 4174);

export default defineConfig({
  testDir: 'tests/e2e',
  // The full controller playthrough takes ~47 min on software GL; run it on demand (CONTROLLER_QA=1).
  testIgnore: process.env.CONTROLLER_QA ? [] : ['**/controller-full.spec.ts'],
  fullyParallel: true,
  // WebGL runs on the CPU in headless mode; parallel browsers starve each other and flake.
  workers: 1,
  timeout: 60000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Software WebGL boots slowly under parallel load; generous waits, still zero retries.
  expect: { timeout: 15000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:' + PORT,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'android-landscape',
      use: { ...devices['Galaxy S9+ landscape'], browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'npx vite preview --outDir dist-test --port ' + PORT + ' --strictPort',
    url: 'http://localhost:' + PORT,
    // Never reuse: parallel worktrees may leave a server with different code on this port.
    reuseExistingServer: false,
    timeout: 60000,
  },
});
