import { expect } from '@playwright/test';
import type { BotStep } from '../../../src/gameplay/types';
import { A, B, BACK, Pad, X } from './pad';

/** Mission-level controller helpers shared by the controller-only QA spec. */

type QaPadState = { pad: { buttons: { pressed: boolean; value: number }[]; axes: number[] } };
type Spawnable = { spawn(x: number, z: number, h: number): void };
type Warpable = { warp(x: number, z: number): void };

export const gameplayState = (pad: Pad): Promise<string | undefined> => pad.mission();

/** Moves the D-pad until the control with this data-key has the focus ring. */
export async function focusKey(pad: Pad, key: string, button: number = B.down): Promise<void> {
  for (let i = 0; i < 16; i++) {
    if ((await pad.focusKey()) === key) return;
    await pad.tap(button);
    await pad.page.waitForTimeout(120);
  }
  expect(await pad.focusKey(), 'focus should reach ' + key).toBe(key);
}

/**
 * Title -> New game -> hub -> Chapters -> pick the chapter -> (content note) -> briefing, all by
 * controller buttons. `done` seeds the missions already completed (a state seed, not an input).
 */
export async function openBriefing(pad: Pad, chapter: 'prologue' | 'ch01', done: readonly string[] = []): Promise<void> {
  const { page } = pad;
  await pad.activate();
  await expect.poll(() => pad.focusKey()).toBe('new-game');
  await pad.tap(A);
  await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 60000 });
  await page.evaluate(
    ([m, c]) => {
      const g = window.__netivim;
      if (!g) return;
      const s = g.getState();
      g.setState({ ...s, completedMissions: [...s.completedMissions, ...(m as string[])], completedChapters: c as string[] });
    },
    [done, chapter === 'ch01' ? ['prologue'] : []] as const,
  );
  await focusKey(pad, 'chapters');
  await pad.tap(A);
  await expect(page.locator('.tl-node').first()).toBeVisible({ timeout: 30000 });
  if (chapter === 'ch01') await pad.tap(B.left);
  await pad.tap(A);
  const note = page.locator('[data-screen="gp-content-note"]');
  const brief = page.locator('[data-screen="gp-briefing"]');
  await expect(note.or(brief)).toBeVisible({ timeout: 90000 });
  if (await note.isVisible()) {
    await pad.expectFocusVisible('content note');
    await pad.expectPromptText('content note');
    await pad.tap(A);
  }
  await expect(brief).toBeVisible({ timeout: 90000 });
  await pad.expectFocusVisible('briefing');
  await pad.expectPromptText('briefing');
}

/** Briefing -> mission by A. */
export async function startFromBriefing(pad: Pad, firstState: string): Promise<void> {
  await pad.tapUntil(A, async () => (await pad.flow()) === 'mission');
  await expect.poll(() => pad.mission(), { timeout: 90000 }).toBe(firstState);
}

/** Debrief by A (focus-checked). */
export async function finishDebrief(pad: Pad, expectNext: 'briefing' | 'quiz'): Promise<void> {
  await expect(pad.page.locator('[data-screen="gp-debrief"]')).toBeVisible({ timeout: 90000 });
  await pad.expectFocusVisible('debrief');
  await pad.expectPromptText('debrief');
  await pad.tapUntil(A, async () => (await pad.flow()) === expectNext, 4);
}

/** The chapter quiz by pad only: answer, next, finish; then back at the hub. */
export async function playQuiz(pad: Pad): Promise<void> {
  const { page } = pad;
  await expect(page.locator('[data-screen="gp-quiz"]')).toBeVisible({ timeout: 60000 });
  await pad.expectFocusVisible('quiz');
  for (let i = 0; i < 80; i++) {
    if ((await pad.flow()) === 'hub') break;
    const key = (await pad.focusKey()) ?? '';
    if (key === 'quiz-finish' || key === 'quiz-next') await pad.tap(A);
    else if (key.startsWith('answer-')) await pad.tap(A);
    else if (await pad.visible('[data-key="quiz-finish"]')) await focusKey(pad, 'quiz-finish');
    else await pad.tap(B.up);
    await page.waitForTimeout(200);
  }
  await expect.poll(() => pad.flow(), { timeout: 60000 }).toBe('hub');
  await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 60000 });
  await pad.expectFocusVisible('hub after quiz');
}

/** A decision sheet: first option by A, read the consequence, continue by A. */
export async function decide(pad: Pad): Promise<void> {
  const { page } = pad;
  await expect(page.locator('[data-screen="gp-decision"]')).toBeVisible({ timeout: 30000 });
  await pad.expectFocusVisible('decision');
  await pad.expectPromptText('decision');
  await pad.tap(A);
  await expect(page.locator('[data-key="decision-continue"]')).toBeVisible({ timeout: 30000 });
  await pad.expectFocusVisible('decision consequence');
  await pad.tap(A);
  await expect(page.locator('[data-screen="gp-decision"]')).toBeHidden({ timeout: 30000 });
}

/** A failure card: shown, focus visible, retry by A. */
export async function retryFailure(pad: Pad): Promise<void> {
  const card = pad.page.locator('[data-screen="gp-failure"]');
  await expect(card).toBeVisible({ timeout: 60000 });
  await pad.expectFocusVisible('failure card');
  await pad.expectPromptText('failure card');
  await pad.tapUntil(A, async () => !(await card.isVisible()), 4);
}

// ---- walking and acting ------------------------------------------------------------------

interface Probe {
  x: number;
  z: number;
  yaw: number;
}
export const probe = (pad: Pad): Promise<Probe> =>
  pad.page.evaluate(() => {
    const p = window.__netivimGameplay?.host?.level?.player;
    return { x: p?.x ?? 0, z: p?.z ?? 0, yaw: p?.cameraYaw ?? 0 };
  });

let lastTarget: { x: number; z: number; within: number } | null = null;

/** Real left-stick walk toward a world point (same maths as the QA bot). */
export async function walkTo(pad: Pad, tx: number, tz: number, within = 0.5): Promise<void> {
  lastTarget = { x: tx, z: tz, within };
  for (let i = 0; i < 500; i++) {
    const p = await probe(pad);
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d <= within) break;
    if (i === 499) throw new Error('walkTo gave up at ' + JSON.stringify(p) + ' toward ' + String(tx) + ',' + String(tz));
    const fwd = (dx / d) * Math.sin(p.yaw) + (dz / d) * Math.cos(p.yaw);
    const right = (dx / d) * -Math.cos(p.yaw) + (dz / d) * Math.sin(p.yaw);
    const s = Math.min(1, d / 1.5);
    await pad.stick(right * s, -fwd * s);
    await pad.page.waitForTimeout(80);
  }
  await pad.stick(0, 0);
  await pad.page.waitForTimeout(250);
}

/** Presses Interact (X) until `done()`; walks back into reach when slow frames drifted away. */
export async function interact(pad: Pad, done: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 6; i++) {
    if (await done()) return;
    if (lastTarget && !(await pad.visible('.gp-hud__prompt'))) {
      const t = lastTarget;
      await walkTo(pad, t.x, t.z, Math.max(0.25, t.within * 0.6));
      lastTarget = t;
    }
    await pad.tap(X);
    for (let j = 0; j < 30; j++) {
      if (await done()) return;
      await pad.page.waitForTimeout(200);
    }
  }
}

export async function spawnAt(pad: Pad, x: number, z: number, heading = 0): Promise<void> {
  await pad.page.evaluate(([px, pz, h]) => (window.__netivimGameplay?.host?.level?.player as unknown as Spawnable).spawn(px as number, pz as number, h as number), [x, z, heading] as const);
  await pad.page.waitForTimeout(150);
}

export async function warp(pad: Pad, x: number, z: number): Promise<void> {
  await pad.page.evaluate(([px, pz]) => (window.__netivimGameplay?.host?.level as unknown as Warpable).warp(px as number, pz as number), [x, z] as const);
}

export const focusedInteractable = (pad: Pad): Promise<string | null> => pad.page.evaluate(() => window.__netivimGameplay?.host?.interactions.focused?.id ?? null);

/** Stand next to an interactable (level warp or spawn), wait for the prompt and its glyph, press X. */
export async function useAt(pad: Pad, id: string | null, spot: { x: number; z: number }, how: 'spawn' | 'warp' = 'spawn', heading = 0): Promise<void> {
  if (how === 'warp') await warp(pad, spot.x, spot.z);
  else await spawnAt(pad, spot.x, spot.z, heading);
  if (id) await expect.poll(() => focusedInteractable(pad), { timeout: 60000 }).toBe(id);
  else await expect(pad.page.locator('.gp-hud__prompt')).toBeVisible({ timeout: 60000 });
  await pad.expectGlyphOn('.gp-hud__prompt .gp-hud__glyph', 'interact', 'prompt ' + String(id));
  await pad.tap(X);
}

export interface DriveResult {
  readonly state: string;
  readonly phase: string;
  readonly sawMeter: boolean;
  readonly sawPrompt: boolean;
}

/**
 * Fast-forwards a vehicle or long-walk mission with the level's QA bot, but through the mocked
 * pad (stick axes and the Interact button), stepping the loop by hand.
 */
export async function driveBot(pad: Pad, o: { until?: string; steps?: readonly BotStep[]; maxSeconds: number }): Promise<DriveResult> {
  return pad.page.evaluate((opts) => {
    const g = window.__netivim;
    const gp = window.__netivimGameplay;
    const qa = (window as unknown as { __qaPad: QaPadState }).__qaPad;
    if (!g || !gp) throw new Error('test hooks missing');
    const padState = qa.pad;
    const DT = 1 / 60;
    let cp = '';
    let queue: BotStep[] = opts.steps ? [...opts.steps] : [];
    let stepT = 0;
    let sawMeter = false;
    let sawPrompt = false;
    const press = (on: boolean): void => {
      const b = padState.buttons[2];
      if (b) {
        b.pressed = on;
        b.value = on ? 1 : 0;
      }
    };
    for (let i = 0; i < opts.maxSeconds * 60; i++) {
      const host = gp.host;
      if (!host || g.flow.state !== 'mission' || host.phase === 'failed' || host.phase === 'complete') break;
      if (opts.until && host.state === opts.until) break;
      if (!opts.steps && host.checkpoint !== cp) {
        cp = host.checkpoint;
        queue = [...((host.def.botScript as Record<string, readonly BotStep[]>)[cp] ?? [])];
        stepT = 0;
      }
      padState.axes[0] = 0;
      padState.axes[1] = 0;
      press(false);
      const step = queue[0];
      const p = host.level?.player;
      let done = false;
      if (step && p) {
        stepT += DT;
        if (step.kind === 'walkTo') {
          const dx = step.x - p.x;
          const dz = step.z - p.z;
          const d = Math.hypot(dx, dz);
          if (d <= (step.within ?? 0.6)) done = true;
          else {
            const yaw = p.cameraYaw;
            const fwd = (dx / d) * Math.sin(yaw) + (dz / d) * Math.cos(yaw);
            const right = (dx / d) * -Math.cos(yaw) + (dz / d) * Math.sin(yaw);
            const s = Math.min(1, d / 1.5);
            padState.axes[0] = right * s;
            padState.axes[1] = -fwd * s;
          }
        } else if (step.kind === 'wait') done = stepT >= step.seconds;
        else if (step.kind === 'press') {
          press(true);
          done = true;
        } else if (step.kind === 'waitFor') done = host.state === step.state;
      }
      g.loop.advance(DT);
      if (document.querySelector('.gp-hud__meter:not([hidden])')) sawMeter = true;
      if (document.querySelector('.gp-hud__prompt:not([hidden])')) sawPrompt = true;
      if (done) {
        queue.shift();
        stepT = 0;
      }
    }
    padState.axes[0] = 0;
    padState.axes[1] = 0;
    press(false);
    const host = gp.host;
    return { state: host?.state ?? 'none', phase: host?.phase ?? 'none', sawMeter, sawPrompt };
  }, o);
}

export { A, B, BACK, X };
