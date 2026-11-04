import { expect, test } from '@playwright/test';
import { A, B, BACK, bootToTitle, FAMILIES, GLYPHS, Pad, X, Y, type Family, type KnownBugs } from './helpers/pad';
import * as L from '../../src/levels/ch00/jaffa/layout';
import { CART_SPOTS, fenceSpot, GRAVEL_PILE, LIGHT_CRATE, SECTION_PILE, SOLUTION, STATION_SPOTS, TABLE_SPOT, TOWER_BASE } from '../../src/levels/ch01/tower/rules';
import { CARD_SLOT_OF_PARTY, CARD_SPOTS, NEIGHBOR, NOTE_DESK, PARTIES, PLACES, PLACE_SPOTS, RADIO, SIGN, STATION_X_OF_PARTY, TABLE } from '../../src/levels/ch01/vote/data';
import { decide, focusKey, driveBot, finishDebrief, interact, openBriefing, playQuiz, retryFailure, spawnAt, startFromBriefing, useAt, walkTo, warp } from './helpers/mission';

/**
 * Controller-only QA for the Prologue and Chapter 1 (BRIEF 7), once per glyph family.
 * Everything is driven through a mocked navigator.getGamepads (see helpers/pad.ts).
 * Documented bugs live in docs/CONTROLLER_QA.md and are listed in KNOWN below.
 *
 * CTRL_FAMILIES=xbox,playstation limits the families (default: all three).
 */

const KNOWN: KnownBugs = {
  'focus-ring-stale': 'CQA-1: bumper tab switch leaves earlier tabs with .is-focus (src/ui/focusManager.ts refocusKey)',
  'focus-offscreen': 'CQA-2: archive viewer card clips on a phone, the Back button is below the screen (src/gameplay/ui/codex.ts provenanceScreen, gameplay.css .gp-provenance)',
  'phone-wording': 'CQA-3: timeline hint says "or with the finger" on a controller (src/locales/he/timeline.json timeline.hint)',
};

const only = (process.env.CTRL_FAMILIES ?? '').split(',').filter(Boolean);
const families = FAMILIES.filter((f) => only.length === 0 || only.includes(f));
/** Whole missions are slow on software GL: all five run for these families (default: xbox). */
const missionOnly = (process.env.CTRL_MISSION_FAMILIES ?? 'xbox').split(',').filter(Boolean);

for (const family of families) {
  test.describe(family, () => {
    test(family + ': title, settings remap, pause, save, exit prompt, disconnect', async ({ page }) => {
      test.setTimeout(300000);
      const pad = await Pad.create(page, family as Family, KNOWN);
      await bootToTitle(pad);
      await pad.activate();

      // Title: focus ring, glyph family, no touch UI.
      await expect.poll(() => pad.focusKey()).toBe('new-game');
      await pad.expectFocusVisible('title');
      await pad.expectPromptText('title');

      // Settings via D-pad (RTL: left of Chapters).
      await pad.tap(B.down);
      await pad.tap(B.left);
      await expect.poll(() => pad.focusKey()).toBe('settings');
      await pad.tap(A);
      await expect(page.locator('[data-ui-screen="settings"]')).toBeVisible();
      await pad.expectFocusVisible('settings graphics');

      // Controls tab (last) with the bumpers, then remap Interact from X to L3.
      for (let i = 0; i < 8 && !(await pad.visible('[data-tab="controls"]')); i++) {
        await pad.tap(B.lb);
        await page.waitForTimeout(400);
      }
      await expect(page.locator('[data-tab="controls"]')).toBeVisible();
      await pad.expectFocusVisible('settings controls');
      for (let i = 0; i < 30 && (await pad.focusKey()) !== 'remap-interact'; i++) await pad.tap(B.down);
      expect(await pad.focusKey()).toBe('remap-interact');
      await expect(page.locator('[data-key="remap-interact"] .nv-remap__value')).toHaveText(GLYPHS[family][B.west] as string);
      await pad.tap(A);
      await expect(page.locator('[data-ui-screen="remap-capture"]')).toBeVisible();
      // Capture waits for a NEW press: release is done, so L3 is new.
      await pad.holdUntil(B.l3, async () => (await page.locator('[data-key="remap-interact"] .nv-remap__value').textContent()) !== GLYPHS[family][B.west], 6000);
      await expect(page.locator('[data-key="remap-interact"] .nv-remap__value')).toHaveText(GLYPHS[family][B.l3] as string);
      await pad.expectFocusVisible('after remap');
      // The remapped button now interacts; the old X does not.
      await pad.tap(B.l3);
      await pad.tap(B.west);
      expect(await pad.expectedGlyph('interact')).toBe(GLYPHS[family][B.l3]);
      await pad.tap(B.rb);
      await pad.tap(BACK);
      await expect(page.locator('[data-ui-screen="settings"]')).toHaveCount(0);

      // Into a mission via the real flow, then pause / save / exit prompt / disconnect.
      await pad.tap(B.up);
      await pad.tap(B.right);
      await page.evaluate(() => {
        const g = window.__netivim;
        if (!g) throw new Error('no hook');
        for (const e of ['openHub', 'openBriefing', 'startMission'] as const) g.flow.send(e);
      });
      await expect.poll(() => pad.flow()).toBe('mission');
      await pad.tap(B.start);
      await expect.poll(() => page.evaluate(() => window.__netivim?.flow.paused)).toBe(true);
      await expect(page.getByRole('dialog')).toBeVisible();
      await pad.expectFocusVisible('pause');
      await pad.tap(B.down);
      await pad.tap(A);
      await expect(page.locator('[data-ui-screen="slots"]')).toBeVisible();
      await pad.expectFocusVisible('slots');
      await pad.tap(A);
      await expect(page.getByRole('status')).toHaveText('המשחק נשמר');
      await page.evaluate(() => window.__netivim?.save.markDirty());
      await pad.tap(B.down);
      await pad.tap(B.down);
      await pad.tap(A);
      const prompt = page.getByRole('alertdialog');
      await expect(prompt).toBeVisible();
      await pad.expectFocusVisible('exit prompt');
      await pad.tap(BACK);
      await expect(prompt).toHaveCount(0);
      await pad.tap(B.start);
      await expect.poll(() => page.evaluate(() => window.__netivim?.flow.paused)).toBe(false);

      // Disconnect mid-mission: pause, touch UI back; reconnect resumes.
      await pad.setPresent(false);
      await expect.poll(() => page.evaluate(() => window.__netivim?.flow.paused)).toBe(true);
      await expect(page.locator('html')).toHaveAttribute('data-input', 'touch');
      await pad.setPresent(true);
      await expect.poll(() => page.evaluate(() => window.__netivim?.flow.paused)).toBe(false);
      await pad.tap(B.north);
      await expect(page.locator('html')).toHaveAttribute('data-input', 'gamepad');
      void X;
      pad.finish();
    });

    test(family + ': new game, hub, timeline, codex, archive viewer, briefing', async ({ page }) => {
      test.setTimeout(300000);
      const pad = await Pad.create(page, family as Family, KNOWN);
      await bootToTitle(pad);
      await pad.activate();
      await expect.poll(() => pad.focusKey()).toBe('new-game');
      await pad.tap(A);
      await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 60000 });
      await pad.expectFocusVisible('hub');
      await pad.expectPromptText('hub');
      // Unlock a codex entry and an archive item so both screens have something to open.
      await page.evaluate(() => {
        const g = window.__netivim;
        if (!g) return;
        const s = g.getState();
        g.setState({ ...s, unlocks: { ...s.unlocks, codex: ['jaffa-jerusalem-railway', 'white-paper'], archive: ['basel-program'] } });
      });

      // Codex: bumpers switch category tabs, down reaches the list, A opens an entry, B returns.
      await pad.tapUntil(B.down, async () => (await pad.focusKey()) === 'codex' || (await pad.focusKey()) === 'archive');
      for (let i = 0; i < 4 && (await pad.focusKey()) !== 'codex'; i++) await pad.tap(B.down);
      expect(await pad.focusKey()).toBe('codex');
      await pad.tapUntil(A, () => pad.visible('[data-screen="gp-codex"]'), 4);
      await expect(page.locator('[data-screen="gp-codex"]')).toBeVisible({ timeout: 30000 });
      await pad.expectFocusVisible('codex');
      await pad.tap(B.rb);
      await expect(page.locator('.gp-tab.is-active')).toHaveCount(1);
      await pad.expectFocusVisible('codex after bumper');
      await pad.tap(B.lb);
      for (let i = 0; i < 10 && !(((await pad.focusKey()) ?? '').startsWith('codex-') && (await pad.focusKey()) !== 'codex-back' && !((await pad.focusKey()) ?? '').startsWith('codex-tab')); i++) await pad.tap(B.down);
      await pad.tap(A);
      await expect(page.locator('.gp-detail .gp-subtitle')).toBeVisible();
      await pad.trigger('rt', 1);
      await page.waitForTimeout(300);
      await pad.trigger('rt', 0);
      await pad.tap(BACK);
      await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 30000 });
      await pad.expectFocusVisible('hub after codex');

      // Archive viewer: A opens the 3D viewer with the provenance card, right stick turns it, B closes.
      for (let i = 0; i < 4 && (await pad.focusKey()) !== 'archive'; i++) await pad.tap(B.down);
      await pad.tap(A);
      await expect(page.locator('[data-screen="gp-archive"]')).toBeVisible({ timeout: 30000 });
      await pad.expectFocusVisible('archive list');
      await pad.tap(A);
      await expect(page.locator('.gp-provenance')).toBeVisible({ timeout: 30000 });
      await pad.expectFocusVisible('archive viewer');
      await pad.expectPromptText('archive viewer');
      await pad.rightStick(1, 0);
      await page.waitForTimeout(500);
      await pad.rightStick(0, 0);
      await pad.tap(BACK);
      await expect(page.locator('[data-screen="gp-archive"]')).toBeVisible({ timeout: 30000 });
      await pad.tap(BACK);
      await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 30000 });

      // Timeline: Chapters, move one chapter with the D-pad and back, open the Prologue.
      for (let i = 0; i < 4 && (await pad.focusKey()) !== 'chapters'; i++) await pad.tap(B.up);
      expect(await pad.focusKey()).toBe('chapters');
      await pad.tap(A);
      await expect(page.locator('.tl-node').first()).toBeVisible({ timeout: 30000 });
      await pad.expectFocusVisible('timeline');
      await pad.expectPromptText('timeline');
      await pad.tap(B.left);
      await pad.expectFocusVisible('timeline after move');
      await pad.tap(B.right);
      await pad.tap(A);
      await expect.poll(() => pad.flow(), { timeout: 60000 }).toBe('briefing');
      await expect(page.locator('[data-screen="gp-briefing"]')).toBeVisible({ timeout: 30000 });
      await expect(page.locator('.gp-map')).toBeVisible();
      await pad.expectFocusVisible('briefing');
      await pad.expectPromptText('briefing');
      // Back out of the briefing to the hub by B, then in again and start by A.
      await pad.tap(BACK);
      await expect.poll(() => pad.flow()).toBe('hub');
      pad.finish();
    });

    test.describe('missions', () => {
      test.skip(!missionOnly.includes(family), 'full missions run for CTRL_MISSION_FAMILIES only');

      test(family + ': Prologue 1, The Archive at Night', async ({ page }) => {
        test.setTimeout(600000);
        const pad = await Pad.create(page, family as Family, KNOWN);
        await bootToTitle(pad);
        await openBriefing(pad, 'prologue');
        await startFromBriefing(pad, 'arrival');
        await expect(page.locator('.an-banner')).toContainText('הזיזו');
        await pad.expectPromptText('archive arrival');
        await walkTo(pad, 0, -4.2, 0.8);
        await expect.poll(() => pad.mission(), { timeout: 30000 }).toBe('reading_room');
        await walkTo(pad, 0, -1.5, 0.5);
        const flag = (f: string) => (): Promise<boolean> =>
          page.evaluate((k) => (window.__netivimGameplay?.host?.level as unknown as { qa?: { progress: Record<string, boolean> } } | undefined)?.qa?.progress[k] ?? false, f);
        await walkTo(pad, 6, 1.5, 0.4);
        for (let i = 0; i < 4 && !(await pad.visible('.gp-hud__prompt')); i++) {
          await walkTo(pad, 6, 1.5, 0.3);
          await page.waitForTimeout(500);
        }
        await expect(page.locator('.gp-hud__prompt')).toBeVisible({ timeout: 30000 });
        await pad.expectGlyphOn('.gp-hud__prompt .gp-hud__glyph', 'interact', 'archive lamp');
        await interact(pad, flag('lamp'));
        await walkTo(pad, -6.5, 1.5, 0.4);
        await interact(pad, flag('drawer'));
        await expect.poll(() => pad.mission(), { timeout: 30000 }).toBe('codex_ledger');
        await walkTo(pad, 3, 4.8, 0.8);
        await walkTo(pad, 6.2, 7.4, 0.4);
        await interact(pad, flag('ledger'));
        // Codex sheet by the View / Create / minus button (map action).
        await expect(page.locator('.an-banner')).toContainText('הקודקס');
        await pad.expectGlyphOn('.an-banner .gp-hud__glyph', 'map', 'codex tutorial banner');
        await pad.tap(B.select);
        await expect(page.locator('.an-sheet')).toContainText('רכבת יפו');
        await pad.expectFocusVisible('archive codex sheet');
        await pad.expectPromptText('archive codex sheet');
        await pad.tap(A);
        await expect.poll(() => pad.mission(), { timeout: 30000 }).toBe('first_document');
        // Locked cabinet: 3D viewer with the provenance card; right stick turns it; A closes.
        await walkTo(pad, 0, 10.8, 0.8);
        await walkTo(pad, -7, 12.9, 0.4);
        await interact(pad, () => pad.visible('.gp-provenance'));
        await expect(page.locator('.gp-provenance')).toBeVisible({ timeout: 30000 });
        await pad.expectPromptText('archive viewer');
        await pad.rightStick(1, 0.3);
        await page.waitForTimeout(800);
        await pad.rightStick(0, 0);
        await pad.tap(A);
        await expect.poll(() => pad.mission(), { timeout: 30000 }).toBe('lenses');
        // Two lenses (lens panels).
        await walkTo(pad, -5.2, 8.2, 0.6);
        await walkTo(pad, -3.4, 8.2, 0.4);
        await interact(pad, () => pad.visible('.an-sheet'));
        await expect(page.locator('.an-sheet')).toContainText(/העדשה של (נועה|סמיר)/);
        await pad.expectFocusVisible('lens panel 1');
        await pad.expectPromptText('lens panel 1');
        await pad.tapUntil(A, async () => !(await pad.visible('.an-sheet')), 5);
        await walkTo(pad, -1.6, 8.2, 0.4);
        await interact(pad, () => pad.visible('.an-sheet'));
        await expect(page.locator('.an-sheet')).toContainText('מה שמוסכם');
        await pad.expectFocusVisible('lens panel 2');
        await pad.tapUntil(A, async () => !(await pad.visible('.an-sheet')), 5);
        await expect.poll(() => pad.mission(), { timeout: 30000 }).toBe('labels_table');
        // Pause + save from the pause menu by Start.
        await walkTo(pad, 0, 8.2, 0.6);
        await walkTo(pad, 2, 11.2, 0.4);
        await pad.tap(B.start);
        await expect.poll(() => page.evaluate(() => window.__netivim?.flow.paused)).toBe(true);
        await pad.expectFocusVisible('pause in mission');
        await pad.tap(B.down);
        await pad.tap(A);
        await expect(page.locator('[data-ui-screen="slots"]')).toBeVisible();
        await expect.poll(() => pad.focusKey()).toBe('manual-1');
        await pad.tapUntil(A, async () => (await page.evaluate(() => window.__netivim?.save.load('manual-1') ?? null)) !== null, 4);
        await pad.tap(B.start);
        await expect.poll(() => page.evaluate(() => window.__netivim?.flow.paused)).toBe(false);
        await page.waitForTimeout(300);
        // Label sorter: three cards, three trays, all by pad.
        await interact(pad, () => pad.visible('.an-sheet'));
        await expect(page.locator('.an-sheet')).toContainText('שייכו כל כרטיס');
        await pad.expectFocusVisible('label sorter');
        await pad.expectPromptText('label sorter');
        await pad.tap(A);
        await pad.tap(A);
        await pad.tap(A);
        await pad.tap(B.left);
        await pad.tap(B.left);
        await pad.expectFocusVisible('label sorter tray');
        await pad.tap(A);
        await pad.tap(A);
        await pad.tap(B.left);
        await pad.tap(A);
        await expect.poll(() => pad.mission(), { timeout: 30000 }).toBe('document_opens');
        await walkTo(pad, 2, 11.2, 0.4);
        await pad.tap(X);
        await page.waitForTimeout(3500);
        // Opening cutscene: skipped by holding A (controller path).
        await expect.poll(() => pad.flow(), { timeout: 60000 }).toBe('cutscene');
        await pad.holdUntil(A, async () => (await pad.flow()) !== 'cutscene', 15000);
        await expect.poll(() => pad.flow(), { timeout: 60000 }).toBe('debrief');
        await finishDebrief(pad, 'briefing');
        await expect(page.locator('[data-screen="gp-briefing"]')).toBeVisible({ timeout: 60000 });
        pad.finish();
      });

      test(family + ': Prologue 2, Letters from Jaffa, then the chapter quiz', async ({ page }) => {
        test.setTimeout(900000);
        const pad = await Pad.create(page, family as Family, KNOWN);
        await bootToTitle(pad);
        await openBriefing(pad, 'prologue', ['archive-at-night']);
        await startFromBriefing(pad, 'port_start');
        await expect(page.locator('.gp-hud__objective')).toHaveText('קבלו את התיק בנמל וסדרו את המשלוחים');
        for (const tag of L.TAGS) await useAt(pad, null, { x: tag.x, z: tag.z + 1.0 });
        await expect.poll(() => pad.mission(), { timeout: 60000 }).toBe('loaded');
        // Planner screen: D-pad focus, A on + buttons, confirm by A.
        await useAt(pad, null, { x: L.PLAN_DESK.x, z: L.PLAN_DESK.z + 1.6 });
        await expect(page.locator('.gp-planner')).toBeVisible({ timeout: 60000 });
        await pad.expectFocusVisible('logistics planner');
        await pad.expectPromptText('logistics planner');
        await expect(page.locator('[data-key="plan-confirm"]')).toBeDisabled();
        await focusKey(pad, 'plus-main-road');
        await pad.expectFocusVisible('planner plus');
        await pad.tap(A);
        await focusKey(pad, 'plus-dunes');
        await pad.tap(A);
        await expect(page.locator('[data-key="plan-confirm"]')).toBeEnabled();
        await focusKey(pad, 'plan-confirm');
        await pad.tap(A);
        await expect(page.locator('.gp-planner')).toHaveCount(0, { timeout: 60000 });
        await useAt(pad, null, L.LOAD_PARTS);
        await useAt(pad, null, L.LOAD_PARCEL);
        await useAt(pad, null, L.LOAD_LETTER);
        await spawnAt(pad, L.GATE_ROAD.x, L.GATE_ROAD.z, 0.2);
        await expect.poll(() => pad.mission(), { timeout: 60000 }).toBe('road_colony');
        await spawnAt(pad, L.DEBORA.x - 1.2, L.DEBORA.z);
        await page.waitForTimeout(300);
        await pad.tap(X);
        await expect.poll(() => pad.mission(), { timeout: 60000 }).toBe('colony_delivered');
        await spawnAt(pad, L.VILLAGE_GATE.x, L.VILLAGE_GATE.z, 1);
        await expect.poll(() => pad.mission(), { timeout: 60000 }).toBe('village_arrival');
        await spawnAt(pad, L.JAMILA.x - 1.2, L.JAMILA.z);
        await page.waitForTimeout(300);
        const steps = page.locator('.gp-hud__steps');
        for (let i = 0; i < 12 && !/1/.test((await steps.textContent()) ?? ''); i++) {
          await pad.tap(X);
          await page.waitForTimeout(1000);
        }
        await expect(steps).toHaveText(/1/, { timeout: 60000 });
        await expect(page.locator('.nv-sub__label')).toBeVisible({ timeout: 60000 });
        await pad.expectPromptText('village testimony');
        await pad.tap(X);
        await expect.poll(() => pad.mission(), { timeout: 60000 }).toBe('village_delivered');
        await spawnAt(pad, L.STATION_ZONE.x, L.STATION_ZONE.z, -1.5);
        await expect.poll(() => pad.mission(), { timeout: 60000 }).toBe('station');
        await useAt(pad, null, L.TICKET_WINDOW);
        await useAt(pad, null, L.TRAIN_DOOR);
        await expect.poll(() => pad.mission(), { timeout: 60000 }).toBe('jerusalem_delivered');
        await expect
          .poll(
            async () => {
              await spawnAt(pad, L.ELIYAHU.x - 1.2, L.ELIYAHU.z);
              await page.waitForTimeout(500);
              return page.locator('.gp-hud__prompt').isVisible();
            },
            { timeout: 240000 },
          )
          .toBe(true);
        await pad.tap(X);
        await expect(page.locator('.gp-hud__steps')).toHaveText(/1/, { timeout: 60000 });
        await pad.tap(X);
        await expect(page.locator('.gp-hud__steps')).toHaveText(/2/, { timeout: 60000 });
        await expect.poll(() => pad.flow(), { timeout: 240000 }).toBe('debrief');
        await finishDebrief(pad, 'quiz');
        await playQuiz(pad);
        pad.finish();
      });

      test(family + ': Chapter 1, Tower and Stockade', async ({ page }) => {
        test.setTimeout(900000);
        const pad = await Pad.create(page, family as Family, KNOWN);
        await bootToTitle(pad);
        await openBriefing(pad, 'ch01');
        await expect(page.locator('.gp-sheet--briefing')).toContainText('בתוך יום');
        await startFromBriefing(pad, 'dawn');
        const stand = (x: number, z: number): { x: number; z: number } => ({ x, z });
        const at = async (id: string, spot: { x: number; z: number }): Promise<void> => {
          await useAt(pad, id, spot, 'spawn', Math.PI);
        };
        for (let i = 0; i < 4; i++) {
          const c = CART_SPOTS[i] as { x: number; z: number };
          await at('cart-' + String(i), stand(c.x, c.z + 2.3));
        }
        await expect.poll(() => pad.mission(), { timeout: 60000 }).toBe('walls');

        // Planning table by pad: cursor with the D-pad, frame type with the bumpers, rotate with Y,
        // place with A, lift with X; the full wall is placed with the stored solution.
        await at('table', stand(TABLE_SPOT.x, TABLE_SPOT.z + 2.2));
        const panel = page.locator('[data-screen="tower-plan"]');
        await expect(panel).toBeVisible({ timeout: 60000 });
        await pad.expectPromptText('planning table');
        const controls = await page.locator('.ch01t-plan__controls').textContent();
        pad.check('glyph-plan-controls', (controls ?? '').includes(await pad.expectedGlyph('confirm')) && (controls ?? '').includes(await pad.expectedGlyph('alt')), 'plan controls text "' + String(controls) + '" lacks this family glyphs');
        type Planner = { cx: number; cy: number; type: string; rot: number };
        const planner = (): Promise<Planner> =>
          page.evaluate(() => {
            const p = (window.__netivimGameplay?.host?.level as unknown as { planner: Planner }).planner;
            return { cx: p.cx, cy: p.cy, type: p.type, rot: p.rot };
          });
        const entries = Object.entries(SOLUTION).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }));
        for (const [id, place] of entries) {
          const type = id.split('-')[0] as string;
          for (let i = 0; i < 8 && (await planner()).type !== type; i++) await pad.tap(B.rb);
          for (let guard = 0; guard < 24; guard++) {
            const c = await planner();
            if (c.cx === place.x && c.cy === place.y) break;
            await pad.tap(c.cx < place.x ? B.right : c.cx > place.x ? B.left : c.cy < place.y ? B.down : B.up);
          }
          for (let i = 0; i < 4 && (await planner()).rot !== place.rot; i++) await pad.tap(Y);
          await pad.tap(A);
        }
        await expect.poll(() => pad.mission(), { timeout: 60000 }).toBe('gravel');
        await expect(panel).toBeHidden();

        for (const trip of [[3, 4], [1, 2], [0, 5]]) {
          await at('gravel-pile', stand(GRAVEL_PILE.x, GRAVEL_PILE.z + 2.4));
          for (const k of trip) await at('station-' + String(k), STATION_SPOTS[k] as { x: number; z: number });
        }
        await expect.poll(() => pad.mission(), { timeout: 60000 }).toBe('tower');
        for (let i = 0; i < 3; i++) {
          await at('sections', stand(SECTION_PILE.x, SECTION_PILE.z + 2.3));
          await at('tower-base', stand(TOWER_BASE.x - 2.2, TOWER_BASE.z + 1.9));
        }
        await expect.poll(() => pad.mission(), { timeout: 60000 }).toBe('fence');
        await at('light-crate', stand(LIGHT_CRATE.x, LIGHT_CRATE.z + 2.3));
        await at('tower-base', stand(TOWER_BASE.x - 2.2, TOWER_BASE.z + 1.9));
        for (let leg = 0; leg < 4; leg++) await at('fence-post', fenceSpot(leg));
        await expect.poll(() => pad.mission(), { timeout: 60000 }).toBe('dusk');
        await at('tower-base', stand(TOWER_BASE.x - 2.2, TOWER_BASE.z + 1.9));
        await expect.poll(() => pad.mission(), { timeout: 60000 }).toBe('lenses');
        await page.waitForTimeout(3500);
        await pad.tap(A);
        const lenses = page.locator('[data-screen="tower-lenses"]');
        await expect(lenses).toBeVisible({ timeout: 60000 });
        await pad.expectFocusVisible('tower lenses panel');
        await pad.expectPromptText('tower lenses panel');
        await pad.tap(A);
        await expect.poll(() => pad.flow(), { timeout: 60000 }).toBe('debrief');
        await finishDebrief(pad, 'briefing');
        pad.finish();
      });

      test(family + ': Chapter 1, failure card and retry (Tower sunset)', async ({ page }) => {
        test.setTimeout(400000);
        const pad = await Pad.create(page, family as Family, KNOWN);
        await bootToTitle(pad);
        await openBriefing(pad, 'ch01');
        await startFromBriefing(pad, 'dawn');
        await page.evaluate(() => window.__netivimGameplay?.host?.fail('levels.ch01.tower.fail.timeout'));
        await expect(page.locator('[data-screen="gp-failure"]')).toContainText('בתוך יום', { timeout: 60000 });
        await retryFailure(pad);
        await expect.poll(() => pad.mission(), { timeout: 60000 }).toBe('dawn');
        pad.finish();
      });

      test(family + ': Chapter 1, Night Landing (boat, soft fail, retry, landing)', async ({ page }) => {
        test.setTimeout(900000);
        const pad = await Pad.create(page, family as Family, KNOWN);
        await bootToTitle(pad);
        await openBriefing(pad, 'ch01', ['tower-and-stockade']);
        await expect(page.locator('[data-screen="gp-briefing"]')).toContainText('נחיתת לילה');
        await startFromBriefing(pad, 'sea');
        const sea = await driveBot(pad, { until: 'patrols', maxSeconds: 90 });
        expect(sea.state).toBe('patrols');
        await pad.checkUi();
        // A soft fail: park in front of the patrol lane until the danger meter fills.
        const seen = await driveBot(pad, { steps: [{ kind: 'walkTo', x: -146, z: 66, within: 3 }, { kind: 'wait', seconds: 90 }], maxSeconds: 120 });
        expect(seen.phase).toBe('failed');
        await expect(page.locator('.gp-sheet--failure')).toContainText('מה קרה באמת', { timeout: 30000 });
        await retryFailure(pad);
        await expect.poll(() => page.evaluate(() => window.__netivimGameplay?.host?.phase), { timeout: 30000 }).toBe('running');
        const rest = await driveBot(pad, { maxSeconds: 700 });
        expect(rest.phase, 'state ' + rest.state).toBe('complete');
        await expect.poll(() => pad.flow(), { timeout: 60000 }).toBe('debrief');
        await finishDebrief(pad, 'briefing');
        pad.finish();
      });

      test(family + ': Chapter 1, The Vote (decisions, note, radio) then the chapter quiz', async ({ page }) => {
        test.setTimeout(900000);
        const pad = await Pad.create(page, family as Family, KNOWN);
        await bootToTitle(pad);
        await openBriefing(pad, 'ch01', ['tower-and-stockade', 'night-landing']);
        await pad.tapUntil(A, async () => (await pad.flow()) === 'mission');
        await expect.poll(() => pad.flow(), { timeout: 60000 }).toBe('mission');
        // A real stick walk, then the planning table.
        const z0 = await page.evaluate(() => window.__netivimGameplay?.host?.level?.player?.z ?? 0);
        await pad.stick(0, -0.6);
        await expect
          .poll(async () => Math.abs((await page.evaluate(() => window.__netivimGameplay?.host?.level?.player?.z ?? 0)) - z0), { timeout: 30000 })
          .toBeGreaterThan(0.3);
        await pad.stick(0, 0);
        await useAt(pad, 'vote-table', TABLE.stand, 'warp');
        for (let i = 0; i < 3; i++) await pad.tap(X);
        await pad.tap(X);
        await decide(pad);
        await expect.poll(() => pad.mission(), { timeout: 30000 }).toBe('statements');
        for (let i = 0; i < PARTIES.length; i++) {
          const spot = CARD_SPOTS[CARD_SLOT_OF_PARTY[i] ?? 0] as { x: number; z: number };
          await useAt(pad, 'vote-card-' + String(CARD_SLOT_OF_PARTY[i]), spot, 'warp');
          await useAt(pad, 'vote-station-' + String(PARTIES[i]), { x: STATION_X_OF_PARTY[i] ?? 0, z: -38.4 }, 'warp');
        }
        await expect.poll(() => pad.mission(), { timeout: 30000 }).toBe('visits');
        await useAt(pad, 'vote-sign', { x: SIGN.x, z: SIGN.z - 1.3 }, 'warp');
        await decide(pad);
        for (const place of PLACES) {
          const q = PLACE_SPOTS[place].questions[0] as { x: number; z: number };
          await warp(pad, q.x, q.z);
          await page.waitForTimeout(800);
          await useAt(pad, 'vote-ask-' + place + '-0', q, 'warp');
          await page.waitForTimeout(500);
          await useAt(pad, 'vote-advice-' + place, PLACE_SPOTS[place].advice, 'warp');
          await decide(pad);
        }
        await expect.poll(() => pad.mission(), { timeout: 30000 }).toBe('note');
        await useAt(pad, 'vote-page', { x: NOTE_DESK.jerusalem.x, z: NOTE_DESK.jerusalem.z + 0.35 }, 'warp');
        await useAt(pad, 'vote-submit', { x: NOTE_DESK.typewriter.x, z: NOTE_DESK.typewriter.z + 0.35 }, 'warp');
        await expect.poll(() => pad.mission(), { timeout: 30000 }).toBe('vote');
        await useAt(pad, 'vote-neighbor', { x: NEIGHBOR.x + 0.4, z: NEIGHBOR.z - 1.0 }, 'warp');
        await decide(pad);
        await useAt(pad, 'vote-radio', { x: RADIO.x, z: RADIO.z - 1.2 }, 'warp');
        await expect.poll(() => pad.flow(), { timeout: 180000 }).toBe('debrief');
        await expect(page.locator('.gp-ledger__row')).toHaveCount(6);
        await pad.expectFocusVisible('choice ledger debrief');
        // Scroll the ledger with the triggers / right stick, then continue to the chapter quiz.
        await pad.trigger('rt', 1);
        await page.waitForTimeout(500);
        await pad.trigger('rt', 0);
        await finishDebrief(pad, 'quiz');
        await playQuiz(pad);
        pad.finish();
      });
    });
  });
}
