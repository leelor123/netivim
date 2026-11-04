import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/events';
import type { GameEvents } from '../../src/core/gameEvents';
import { dragToLook, LOOK_RAD_PER_PX, LOOK_SENSITIVITY_MAX } from '../../src/core/input/lookDrag';
import { InputManager } from '../../src/core/input/inputManager';
import { applyLookDrag, DEFAULT_ORBIT, type OrbitState } from '../../src/gameplay/core/orbit';
import { captionCapacity, captionHead, pageDurations, paginateCaption } from '../../src/ui/captions';
import { computeRegions, intersects, regionTextScale, regionVars, REGIONS, type Region } from '../../src/ui/layout';
import { TOUCH_BUTTONS, touchButtonState } from '../../src/ui/touch/joystick';

function manager(): InputManager {
  return new InputManager(new EventBus<GameEvents>(), { getGamepads: () => [] });
}

/**
 * Plays one physical drag of `totalPx` (x) split into `moves` pointer events, delivered over
 * `steps` simulation steps, and returns the final camera yaw.
 */
function dragYaw(totalPx: number, moves: number, steps: number): number {
  const input = manager();
  const orbit: OrbitState = { yaw: 0, pitch: 0.3, distance: 6 };
  const perStep = Math.ceil(moves / steps);
  let sent = 0;
  for (let s = 0; s < steps; s++) {
    for (let m = 0; m < perStep && sent < moves; m++, sent++) input.addLookDelta(totalPx / moves, 0);
    input.update();
    applyLookDrag(orbit, input.lookDrag.x, input.lookDrag.y);
  }
  return orbit.yaw;
}

describe('touch / mouse look drag', () => {
  it('converts pixels to radians with no dt (documented constant)', () => {
    const out = { x: 0, y: 0 };
    dragToLook(100, -40, 1, out);
    expect(out.x).toBeCloseTo(100 * LOOK_RAD_PER_PX);
    expect(out.y).toBeCloseTo(-40 * LOOK_RAD_PER_PX);
    dragToLook(100, 0, 99, out);
    expect(out.x).toBeCloseTo(100 * LOOK_RAD_PER_PX * LOOK_SENSITIVITY_MAX);
  });

  it('is frame-rate independent: the same drag turns the same angle at 30, 60 or 120 steps', () => {
    const a = dragYaw(400, 40, 10);
    const b = dragYaw(400, 40, 40);
    const c = dragYaw(400, 7, 120);
    expect(a).toBeCloseTo(-400 * LOOK_RAD_PER_PX, 6);
    expect(b).toBeCloseTo(a, 6);
    expect(c).toBeCloseTo(a, 6);
  });

  it('consumes the drag once: steps without movement do not rotate', () => {
    const input = manager();
    input.addLookDelta(50, 20);
    input.update();
    expect(input.lookDrag.x).toBeGreaterThan(0);
    input.update();
    expect(input.lookDrag.x).toBe(0);
    expect(input.lookDrag.y).toBe(0);
  });

  it('keeps the stick look vector untouched (it also scrolls menus)', () => {
    const input = manager();
    input.addLookDelta(300, 300);
    input.update();
    expect(input.look.x).toBe(0);
    expect(input.look.y).toBe(0);
  });

  it('drops a pending drag on clear and ignores non-finite input', () => {
    const input = manager();
    input.addLookDelta(Number.NaN, 5);
    input.addLookDelta(80, 0);
    input.clearLookDelta();
    input.update();
    expect(input.lookDrag.x).toBe(0);
  });

  it('drag up looks up and pitch stays clamped', () => {
    const orbit: OrbitState = { yaw: 0, pitch: 0.3, distance: 6 };
    applyLookDrag(orbit, 0, -0.1);
    expect(orbit.pitch).toBeCloseTo(0.2);
    applyLookDrag(orbit, 0, 100);
    expect(orbit.pitch).toBe(DEFAULT_ORBIT.maxPitch);
  });

  it('marks touch as the active device', () => {
    const input = manager();
    input.addLookDelta(5, 0, 'touch');
    expect(input.device).toBe('touch');
    input.addLookDelta(5, 0, 'mouse');
    expect(input.device).toBe('keyboard');
  });
});

describe('short taps are latched (never lost between two steps)', () => {
  it('a touch tap down and up between two updates reads as pressed for exactly one update', () => {
    const input = manager();
    input.setVirtual('confirm', true);
    input.setVirtual('confirm', false);
    input.update();
    expect(input.justPressed('confirm')).toBe(true);
    expect(input.isDown('confirm')).toBe(true);
    input.update();
    expect(input.isDown('confirm')).toBe(false);
    expect(input.justReleased('confirm')).toBe(true);
  });

  it('a key press and release between two updates reads as pressed for exactly one update', () => {
    const input = manager();
    const target = new EventTarget();
    input.attach(target);
    const key = (type: string, code: string): void => {
      target.dispatchEvent(Object.assign(new Event(type), { code }));
    };
    key('keydown', 'Enter');
    key('keyup', 'Enter');
    input.update();
    expect(input.justPressed('confirm')).toBe(true);
    input.update();
    expect(input.isDown('confirm')).toBe(false);
  });

  it('a held button stays down and is justPressed only once', () => {
    const input = manager();
    input.setVirtual('interact', true);
    input.update();
    expect(input.justPressed('interact')).toBe(true);
    input.update();
    expect(input.isDown('interact')).toBe(true);
    expect(input.justPressed('interact')).toBe(false);
    input.setVirtual('interact', false);
    input.update();
    expect(input.isDown('interact')).toBe(false);
  });

  it('the press that resumed the game is swallowed (no fresh pause press after resume)', () => {
    const input = manager();
    input.setVirtual('pause', true);
    input.setVirtual('pause', false);
    input.swallowPresses();
    input.update();
    expect(input.justPressed('pause')).toBe(false);
    input.setVirtual('alt', true);
    input.swallowPresses();
    input.update();
    expect(input.isDown('alt')).toBe(true);
    expect(input.justPressed('alt')).toBe(false);
  });

  it('touch zoom holds the trigger axis while pressed', () => {
    const input = manager();
    input.setTouchScroll(1);
    input.update();
    expect(input.scroll).toBe(1);
    input.setTouchScroll(0);
    input.update();
    expect(input.scroll).toBe(0);
  });
});

describe('screen layout regions', () => {
  const viewports = [
    { w: 1170, h: 540 }, // S26 Ultra landscape in CSS px (hudshot)
    { w: 915, h: 412 },
    { w: 800, h: 360 },
    { w: 1280, h: 720 },
    { w: 1920, h: 1080 },
  ];
  const safes = [undefined, { t: 0, r: 44, b: 20, l: 44 }];

  for (const vp of viewports) {
    for (const touchScale of [0.75, 1, 1.5]) {
      for (const stickSide of ['left', 'right'] as const) {
        for (const safe of safes) {
          it('no two regions intersect at ' + String(vp.w) + 'x' + String(vp.h) + ' scale ' + String(touchScale) + ' ' + stickSide + (safe ? ' notch' : ''), () => {
            const r = computeRegions(safe ? { ...vp, touchScale, stickSide, safe } : { ...vp, touchScale, stickSide });
            for (let i = 0; i < REGIONS.length; i++) {
              const a = r[REGIONS[i] as Region];
              expect(a.w).toBeGreaterThanOrEqual(0);
              expect(a.h).toBeGreaterThanOrEqual(0);
              expect(a.x).toBeGreaterThanOrEqual(0);
              expect(a.y).toBeGreaterThanOrEqual(0);
              expect(a.x + a.w).toBeLessThanOrEqual(vp.w + 1e-6);
              expect(a.y + a.h).toBeLessThanOrEqual(vp.h + 1e-6);
              for (let j = i + 1; j < REGIONS.length; j++) {
                const b = r[REGIONS[j] as Region];
                expect(intersects(a, b), REGIONS[i] + ' vs ' + REGIONS[j]).toBe(false);
              }
            }
          });
        }
      }
    }
  }

  for (const vp of viewports) {
    for (const textScale of [1.2, 1.4]) {
      for (const stickSide of ['left', 'right'] as const) {
        it('text scale ' + String(textScale) + ': no overlap, captions keep room at ' + String(vp.w) + 'x' + String(vp.h) + ' ' + stickSide, () => {
          const base = computeRegions({ ...vp, stickSide });
          const r = computeRegions({ ...vp, stickSide, textScale });
          for (let i = 0; i < REGIONS.length; i++) {
            const a = r[REGIONS[i] as Region];
            expect(a.w).toBeGreaterThanOrEqual(0);
            expect(a.h).toBeGreaterThanOrEqual(0);
            expect(a.x + a.w).toBeLessThanOrEqual(vp.w + 1e-6);
            expect(a.y + a.h).toBeLessThanOrEqual(vp.h + 1e-6);
            for (let j = i + 1; j < REGIONS.length; j++) expect(intersects(a, r[REGIONS[j] as Region]), REGIONS[i] + ' vs ' + REGIONS[j]).toBe(false);
          }
          expect(r.captions.h).toBeGreaterThanOrEqual(Math.min(84, base.captions.h) - 1e-6);
          const ts = regionTextScale({ ...vp, stickSide, textScale });
          expect(ts).toBeGreaterThanOrEqual(1);
          expect(ts).toBeLessThanOrEqual(textScale);
          expect(r.notice.h).toBe(Math.ceil(36 * ts));
        });
      }
    }
  }

  it('grows text rows on a roomy screen and steps down on a short one', () => {
    expect(regionTextScale({ w: 1920, h: 1080, textScale: 1.4 })).toBe(1.4);
    expect(computeRegions({ w: 1920, h: 1080, textScale: 1.4 }).notice.h).toBeGreaterThan(computeRegions({ w: 1920, h: 1080 }).notice.h);
    expect(regionTextScale({ w: 800, h: 360, textScale: 1.4 })).toBeLessThan(1.4);
    expect(regionTextScale({ w: 800, h: 360 })).toBe(1);
  });

  it('gives the phone frame usable centre columns and corners', () => {
    const r = computeRegions({ w: 1170, h: 540 });
    expect(r.captions.w).toBeGreaterThan(600);
    expect(r.captions.h).toBeGreaterThan(100);
    expect(r.notice.w).toBeGreaterThan(400);
    expect(r.prompt.h).toBeGreaterThanOrEqual(40);
    expect(r.system.x).toBeLessThan(r.objective.x);
    expect(r.stick.x).toBeLessThan(r.actions.x);
    // The tutorial line is near the top, never mid-screen.
    expect(r.notice.y + r.notice.h).toBeLessThan(540 * 0.2);
  });

  it('mirrors the bottom corners when left-handed', () => {
    const r = computeRegions({ w: 1170, h: 540, stickSide: 'right' });
    expect(r.actions.x).toBeLessThan(r.stick.x);
  });

  it('writes six CSS variables per region', () => {
    const vars = regionVars(computeRegions({ w: 1000, h: 500 }), { w: 1000, h: 500 });
    expect(Object.keys(vars)).toHaveLength(REGIONS.length * 6);
    expect(vars['--rg-system-x']).toBe('12px');
    expect(vars['--rg-system-y']).toBe('12px');
  });

  it('detects overlap and ignores touching edges', () => {
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });
});

describe('captions (subtitle + testimony / speaker label merged)', () => {
  it('puts speaker and label chip in one head', () => {
    expect(captionHead({ speaker: 'נועה', label: 'composite' }, 'עדות')).toEqual({ speaker: 'נועה', label: 'composite', visible: true });
  });

  it('introduces an unnamed labeled line as a testimony', () => {
    expect(captionHead({ speaker: null, label: 'documented' }, 'עדות')).toEqual({ speaker: 'עדות', label: 'documented', visible: true });
  });

  it('shows no head for a plain narration line', () => {
    expect(captionHead({ speaker: null, label: null }, 'עדות').visible).toBe(false);
  });

  it('keeps short text on one page', () => {
    expect(paginateCaption('שלום עולם', 100)).toEqual(['שלום עולם']);
  });

  it('pages long text without losing or reordering words, each page within capacity', () => {
    const text = 'זו עדות ארוכה מאוד. היא מתארת לילה שלם בנמל יפו. הסירות הגיעו מאוחר, והאנשים חיכו על המזח עד הבוקר. איש לא ידע מה יקרה.';
    const pages = paginateCaption(text, 40);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.join(' ')).toBe(text);
    for (const p of pages) expect(p.length).toBeLessThanOrEqual(40);
  });

  it('prefers to break after a sentence', () => {
    const pages = paginateCaption('משפט ראשון קצר מאוד כאן. ועוד משפט שני ארוך', 30);
    expect(pages[0]).toBe('משפט ראשון קצר מאוד כאן.');
  });

  it('gives an over-long word its own page', () => {
    const pages = paginateCaption('a ' + 'x'.repeat(50) + ' b', 10);
    expect(pages).toEqual(['a', 'x'.repeat(50), 'b']);
  });

  it('splits the duration by length with a readable minimum', () => {
    const d = pageDurations(['aaaa', 'aaaaaaaaaaaa'], 8000);
    expect(d[1]).toBeGreaterThan(d[0] as number);
    expect(Math.min(...d)).toBeGreaterThanOrEqual(1000);
    expect((d[0] ?? 0) + (d[1] ?? 0)).toBe(8000);
    expect(pageDurations(['a'], 0)).toEqual([0]);
  });

  it('fits more text in the phone caption region at small sizes than at large', () => {
    const r = computeRegions({ w: 1170, h: 540 }).captions;
    expect(captionCapacity(r.w, r.h, 15, true)).toBeGreaterThan(captionCapacity(r.w, r.h, 28, true));
    expect(captionCapacity(r.w, r.h, 18, true)).toBeGreaterThanOrEqual(46);
  });
});

describe('touch buttons', () => {
  it('shows only interact and alt during play (pause is the HUD icon, codex in the pause menu)', () => {
    expect([...TOUCH_BUTTONS]).toEqual(['interact', 'alt']);
    expect(TOUCH_BUTTONS).not.toContain('map');
    expect(TOUCH_BUTTONS).not.toContain('pause');
  });

  it('lights interact only when an interaction is in reach', () => {
    expect(touchButtonState('interact', true)).toBe('ready');
    expect(touchButtonState('interact', false)).toBe('dimmed');
    expect(touchButtonState('alt', false)).toBe('ready');
  });
});
