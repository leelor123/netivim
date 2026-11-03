import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
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
    baseURL: 'http://localhost:4174',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'android-landscape',
      use: { ...devices['Galaxy S9+ landscape'], browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'npx vite preview --outDir dist-test --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
