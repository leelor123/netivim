import type { Game } from '../../game';
import type { Action, Vec2 } from '../../core/input/types';
import { glyphFor, setGlyphBindings } from '../glyphs';
import { activeLayout } from '../layout';
import { buttonSide, clampToRing, stickSide, stickVector, STICK_DEAD_ZONE, STICK_RADIUS, TOUCH_BUTTONS, touchButtonState, type TouchLayout } from './joystick';
import './touch.css';

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.dataset.touchUi = '';
  return node;
}

/** True while the 3D view may be turned by a drag: a running mission with no menu or sheet open. */
function lookAllowed(game: Game): boolean {
  if (game.flow.state !== 'mission' || game.flow.paused) return false;
  // Gameplay sheets (briefing, decisions, quiz...) and level modals take the screen.
  return !document.querySelector('.gp-root, .an-stage:not([hidden]), .an-viewer:not([hidden])');
}

/**
 * Turns pointer drags on `el` into look deltas (InputManager.addLookDelta). One pointer at a
 * time (its own pointer id, so it works together with the joystick finger). Mouse: primary
 * button only. Returns an unbind function.
 */
function bindLookDrag(game: Game, el: HTMLElement, onStart?: () => void): () => void {
  let pointer = -1;
  let lastX = 0;
  let lastY = 0;
  const down = (e: PointerEvent): void => {
    if (pointer !== -1 || !lookAllowed(game)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointer = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events in tests have no active pointer to capture.
    }
    e.preventDefault();
    onStart?.();
  };
  const move = (e: PointerEvent): void => {
    if (e.pointerId !== pointer) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (!lookAllowed(game)) return;
    game.input.addLookDelta(dx, dy, e.pointerType === 'mouse' ? 'mouse' : 'touch');
  };
  const up = (e: PointerEvent): void => {
    if (e.pointerId === pointer) pointer = -1;
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('lostpointercapture', up);
  };
}

/**
 * Touch controls built on pointer events, so several fingers work at once:
 * - a look area under everything else (drag to turn the camera),
 * - a virtual joystick (dynamic origin) on the thumb side, idle in the "stick" screen region,
 * - the action buttons (interact, alt) in the "actions" region (src/ui/layout.ts).
 * Visible only during missions; CSS hides every [data-touch-ui] element the instant a gamepad
 * becomes the active device. A mouse drag on the canvas also turns the camera (desktop).
 */
export function installTouchControls(game: Game): () => void {
  const { input, bus, i18n } = game;
  const root = make('div', 'touch-root');
  root.hidden = true;
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', i18n.t('controls.touch.group'));
  const look = make('div', 'touch-look');
  look.setAttribute('aria-label', i18n.t('controls.touch.look'));
  const zone = make('div', 'touch-zone');
  zone.setAttribute('aria-label', i18n.t('controls.touch.joystick'));
  const ring = make('div', 'touch-ring');
  const knob = make('div', 'touch-knob');
  const cluster = make('div', 'touch-btns');
  root.append(look, zone, ring, knob, cluster);

  const buttonEls = new Map<Action, HTMLButtonElement>();
  for (const action of TOUCH_BUTTONS) {
    const b = make('button', 'touch-btn');
    b.type = 'button';
    b.dataset.action = action;
    b.setAttribute('aria-label', i18n.t('controls.action.' + action));
    b.textContent = glyphFor(action, 'touch', null).label;
    cluster.append(b);
    buttonEls.set(action, b);
  }
  let interactAvailable = false;
  const syncButtons = (): void => {
    for (const [action, el] of buttonEls) el.dataset.state = touchButtonState(action, interactAvailable);
  };
  syncButtons();

  let layout: TouchLayout = 'right-handed';
  let scale = 1;
  let stickPointer = -1;
  let originX = 0;
  let originY = 0;
  const vec: Vec2 = { x: 0, y: 0 };
  const clamped: Vec2 = { x: 0, y: 0 };

  const place = (el: HTMLElement, x: number, y: number): void => {
    el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
  };

  /** Rest position of the stick: the centre of the "stick" screen region. */
  const placeIdle = (): void => {
    const r = STICK_RADIUS * scale;
    const region = activeLayout()?.regions.stick;
    const x = region ? region.x + region.w / 2 : stickSide(layout) === 'left' ? 40 + r : window.innerWidth - 40 - r;
    const y = region ? region.y + region.h / 2 : window.innerHeight - 24 - r;
    ring.dataset.idle = '';
    knob.dataset.idle = '';
    place(ring, x - r, y - r);
    place(knob, x - 28 * scale, y - 28 * scale);
  };

  const releaseStick = (): void => {
    stickPointer = -1;
    input.setTouchMove(0, 0);
    placeIdle();
  };

  const applySettings = (): void => {
    const c = game.settings.value.controls;
    layout = c.touchLayout;
    scale = c.touchSize;
    root.style.setProperty('--touch-scale', String(scale));
    root.style.setProperty('--touch-opacity', String(c.touchOpacity));
    root.dataset.side = buttonSide(layout);
    setGlyphBindings(c.bindings);
    if (stickPointer === -1) placeIdle();
  };

  const releaseAll = (): void => {
    releaseStick();
    input.clearLookDelta();
    for (const [action, el] of buttonEls) {
      input.setVirtual(action, false);
      delete el.dataset.down;
    }
  };

  const syncVisibility = (): void => {
    const show = game.flow.state === 'mission' && !game.flow.paused;
    if (!show) releaseAll();
    root.hidden = !show;
    if (show) placeIdle();
  };

  const noMenu = (e: Event): void => e.preventDefault();
  root.addEventListener('contextmenu', noMenu);
  root.addEventListener('selectstart', noMenu);
  root.addEventListener('dragstart', noMenu);

  // --- look area (touch and mouse) ---
  const offLook = bindLookDrag(game, look);
  const canvas = document.getElementById('scene');
  const offCanvasLook = canvas ? bindLookDrag(game, canvas) : (): void => undefined;

  // --- joystick ---
  const onStickDown = (e: PointerEvent): void => {
    if (stickPointer !== -1) return;
    e.preventDefault();
    stickPointer = e.pointerId;
    originX = e.clientX;
    originY = e.clientY;
    zone.setPointerCapture(e.pointerId);
    delete ring.dataset.idle;
    delete knob.dataset.idle;
    const r = STICK_RADIUS * scale;
    place(ring, originX - r, originY - r);
    place(knob, originX - 28 * scale, originY - 28 * scale);
    input.setTouchMove(0, 0);
  };
  const onStickMove = (e: PointerEvent): void => {
    if (e.pointerId !== stickPointer) return;
    const r = STICK_RADIUS * scale;
    const dx = e.clientX - originX;
    const dy = e.clientY - originY;
    stickVector(dx, dy, r, STICK_DEAD_ZONE, vec);
    input.setTouchMove(vec.x, vec.y);
    clampToRing(dx, dy, r, clamped);
    place(knob, originX + clamped.x - 28 * scale, originY + clamped.y - 28 * scale);
  };
  const onStickUp = (e: PointerEvent): void => {
    if (e.pointerId === stickPointer) releaseStick();
  };
  zone.addEventListener('pointerdown', onStickDown);
  zone.addEventListener('pointermove', onStickMove);
  zone.addEventListener('pointerup', onStickUp);
  zone.addEventListener('pointercancel', onStickUp);
  zone.addEventListener('lostpointercapture', onStickUp);

  // --- action buttons ---
  const buttonPointers = new Map<number, Action>();
  const setButton = (action: Action, pressed: boolean): void => {
    input.setVirtual(action, pressed);
    const el = buttonEls.get(action);
    if (!el) return;
    if (pressed) el.dataset.down = '';
    else delete el.dataset.down;
  };
  const onBtnDown = (e: PointerEvent): void => {
    const action = (e.currentTarget as HTMLElement).dataset.action as Action | undefined;
    if (!action) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    buttonPointers.set(e.pointerId, action);
    setButton(action, true);
  };
  const onBtnUp = (e: PointerEvent): void => {
    const action = buttonPointers.get(e.pointerId);
    if (action === undefined) return;
    buttonPointers.delete(e.pointerId);
    setButton(action, false);
  };
  for (const el of buttonEls.values()) {
    el.addEventListener('pointerdown', onBtnDown);
    el.addEventListener('pointerup', onBtnUp);
    el.addEventListener('pointercancel', onBtnUp);
    el.addEventListener('lostpointercapture', onBtnUp);
  }

  const onResize = (): void => {
    if (stickPointer === -1) placeIdle();
  };
  window.addEventListener('resize', onResize);

  const offs = [
    bus.on('flow:changed', syncVisibility),
    bus.on('flow:pause-changed', syncVisibility),
    bus.on('settings:changed', ({ key }) => {
      // The layout recomputes its regions on the same event; place the stick after it.
      if (key === 'controls') queueMicrotask(applySettings);
    }),
    bus.on('ui:interact-available', ({ available }) => {
      interactAvailable = available;
      syncButtons();
    }),
  ];

  document.body.append(root);
  applySettings();
  syncVisibility();

  return () => {
    for (const off of offs) off();
    offLook();
    offCanvasLook();
    window.removeEventListener('resize', onResize);
    releaseAll();
    root.remove();
  };
}
