// Captures in-game screenshots from the test build (VITE_TEST_HOOKS) at the Ultra preset.
// Usage: npm run screenshots   (builds the test build, writes screenshots/, gitignored)
// Adaptive quality is switched off so a slow software-GL browser does not lower the preset.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const PORT = 4180;
const server = spawn('npx vite preview --outDir dist-test --port ' + PORT + ' --strictPort', { shell: true, stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const HIDE_UI = 'body > *:not(canvas#scene) { visibility: hidden !important; }';
const results = [];

async function shot(page, name, fn) {
  try {
    await fn();
    // Ultra on a software GPU can take tens of seconds per frame; allow it.
    await page.screenshot({ path: 'screenshots/' + name + '.png', timeout: 300000 });
    results.push('ok   ' + name);
  } catch (e) {
    results.push('FAIL ' + name + ': ' + String(e).split('\n')[0]);
  }
}

async function ultra(page) {
  await page.evaluate(() => {
    window.__netivimGraphics?.setAdaptiveEnabled(false);
    window.__netivim.settings.update('graphics', { mode: 'preset', preset: 'ultra', benchmarked: true });
  });
}

async function freshPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 720 }, deviceScaleFactor: 1, hasTouch: true });
  await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__netivim?.flow.state === 'title' && !!window.__netivimGraphics, null, { timeout: 90000 });
  await ultra(page);
  await wait(2000);
  return page;
}

async function toHub(page) {
  await page.evaluate(() => window.__netivim.flow.send('openHub'));
  await page.waitForSelector('[data-screen="gp-hub"]', { timeout: 60000 });
}

try {
  await wait(4000);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  let page = await freshPage(browser);
  await shot(page, '01-title', () => wait(6000));
  await shot(page, '02-settings-custom', async () => {
    await page.evaluate(() => window.__netivim.settings.update('graphics', { mode: 'custom' }));
    await page.getByText('הגדרות', { exact: true }).first().click();
    await wait(2500);
  });
  await page.close();

  page = await freshPage(browser);
  await shot(page, '03-hub-menu', async () => {
    await toHub(page);
    await wait(7000);
  });
  await shot(page, '04-archive-hall', async () => {
    await page.addStyleTag({ content: HIDE_UI });
    await wait(1500);
  });
  await page.close();

  page = await freshPage(browser);
  await shot(page, '05-codex', async () => {
    await toHub(page);
    await page.evaluate(() => window.__netivimGameplay?.openCodex());
    await wait(4000);
  });
  await page.close();

  page = await freshPage(browser);
  await shot(page, '06-archive-document-3d', async () => {
    await toHub(page);
    await page.evaluate(() => window.__netivimGameplay?.openArchive());
    await wait(6000);
  });
  await page.close();

  page = await freshPage(browser);
  await shot(page, '07-briefing', async () => {
    await toHub(page);
    await page.evaluate(() => window.__netivimGameplay?.beginChapter('sample', true));
    await page.waitForFunction(() => window.__netivim.flow.state === 'briefing', null, { timeout: 60000 });
    await wait(3000);
  });
  await shot(page, '08-in-mission', async () => {
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__netivim.flow.state === 'mission', null, { timeout: 60000 });
    await page.keyboard.down('KeyW');
    await wait(1200);
    await page.keyboard.up('KeyW');
    await wait(5000);
  });
  await page.close();

  page = await freshPage(browser);
  await shot(page, '09-hills-1948', async () => {
    await page.addStyleTag({ content: HIDE_UI });
    await page.evaluate(async () => {
      const s = await window.__netivimWorld.createSampleScene();
      window.__netivim.scenes.switchTo(s);
    });
    await wait(10000);
  });
  await page.close();

  page = await freshPage(browser);
  await shot(page, '10-living-map', async () => {
    await page.evaluate(() => {
      const root = document.createElement('div');
      root.style.cssText = 'position:fixed;inset:0;z-index:50';
      document.body.append(root);
      window.__netivimTimeline.openLinked(root, { onSelect: () => undefined });
    });
    await wait(7000);
  });
  await page.close();

  await browser.close();
} finally {
  server.kill();
  console.log(results.join('\n'));
}
