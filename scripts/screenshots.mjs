// Captures in-game screenshots from the test build (VITE_TEST_HOOKS) at the Ultra preset.
// Usage: npm run build:test && node scripts/screenshots.mjs (writes screenshots/, gitignored)
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const PORT = 4180;
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-test', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hideUi = `body > *:not(canvas#scene) { visibility: hidden !important; }`;

try {
  await wait(4000);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 720 }, deviceScaleFactor: 1, hasTouch: true });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__netivim?.flow.state === 'title', null, { timeout: 60000 });
  await page.evaluate(() => window.__netivim.settings.update('graphics', { mode: 'preset', preset: 'ultra', benchmarked: true }));
  await wait(6000);
  await page.screenshot({ path: 'screenshots/01-title.png' });

  await page.getByText('הגדרות', { exact: true }).first().click();
  await wait(2500);
  await page.screenshot({ path: 'screenshots/02-settings.png' });
  await page.keyboard.press('Escape');
  await wait(1000);

  const style = await page.addStyleTag({ content: hideUi });
  await page.evaluate(async () => {
    const hub = await window.__netivimWorld.createHubScene();
    window.__netivim.scenes.switchTo(hub);
  });
  await wait(7000);
  await page.screenshot({ path: 'screenshots/03-archive-hub.png' });

  await page.evaluate(async () => {
    const s = await window.__netivimWorld.createSampleScene();
    window.__netivim.scenes.switchTo(s);
  });
  await wait(9000);
  await page.screenshot({ path: 'screenshots/04-hills-1948.png' });

  await style.evaluate((n) => n.remove());
  await page.evaluate(() => {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;z-index:50';
    document.body.append(root);
    window.__netivimTimeline.openLinked(root, { onSelect: () => undefined });
  });
  await wait(7000);
  await page.screenshot({ path: 'screenshots/05-living-map-timeline.png' });

  await browser.close();
} finally {
  server.kill();
}
