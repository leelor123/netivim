import { defineConfig } from '@playwright/test';
import base from '../../playwright.config';

/**
 * The E2E suite on another port (4176), for machines where parallel worktrees already hold 4174
 * (reuseExistingServer would otherwise test another worktree's build). Same tests, same device:
 *   npm run build:test && npx playwright test -c tests/visual/e2e-alt-port.config.ts
 */
export default defineConfig({
  ...base,
  testDir: '../e2e',
  use: { ...base.use, baseURL: 'http://localhost:4176' },
  webServer: {
    command: 'npx vite preview --outDir dist-test --port 4176 --strictPort',
    cwd: '../..',
    url: 'http://localhost:4176',
    reuseExistingServer: false,
    timeout: 180000,
  },
});
