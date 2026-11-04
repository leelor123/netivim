import './ui.css';
import type { Game } from '../game';
import type { UiContext } from './context';
import { h } from './dom';
import { FocusManager } from './focusManager';
import { installFonts } from './fonts';
import { createHud } from './hud';
import { canPauseIn, exitPath, pausePressResumes } from './logic';
import { ScreenManager } from './screenManager';
import { pauseScreen, slotsScreen } from './screens/pause';
import { titleScreen } from './screens/title';
import { createSubtitles } from './subtitles';
import { DomScreenHost, type UiScreen } from './uiScreen';

/** A key the UI handled this recently owns the pause press of the same frame (Escape = back + pause). */
const RECENT_KEY_MS = 300;
/** Screens hosted by other systems (timeline, living map) carry data-screen outside the UI root. */
const FOREIGN_SCREEN = '[data-screen]';

/**
 * Installs the menu and HUD layer: screen stack, controller-first focus, title / pause /
 * settings screens, HUD, toasts and subtitles. Returns a disposer.
 */
export function installUI(game: Game): () => void {
  installFonts();
  const root = document.getElementById('ui') ?? document.body.appendChild(h('main', { attrs: { id: 'ui' } }));
  root.classList.add('nv-root');
  const layer = h('div', { class: 'nv-layer' });
  const rtl = game.i18n.dir === 'rtl';
  const html = document.documentElement;
  const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reducedMotion = (): boolean => game.settings.value.accessibility.reducedMotion || (motionQuery?.matches ?? false);
  const applyMotion = (): void => {
    html.dataset.motion = reducedMotion() ? 'reduced' : 'full';
  };
  applyMotion();

  const screens = new ScreenManager<UiScreen>(new DomScreenHost(layer, reducedMotion));
  const isPauseOpen = (): boolean => screens.screens[0]?.id === 'pause';
  const focus = new FocusManager({
    input: game.input,
    screens,
    rtl,
    now: () => performance.now(),
    reducedMotion,
    // Escape (back + pause) at the pause root is left to the frame hook, which resumes on it.
    // Resuming from the key event instead would let the next step read it as a new pause press.
    deferPauseKey: () => game.flow.paused && screens.depth === 1 && isPauseOpen(),
  });

  const resume = (): void => game.flow.setPaused(false);
  const dateTime = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  const ctx: UiContext = {
    game,
    t: (key, params) => game.i18n.t(key, params),
    rtl,
    screens,
    focus,
    resume,
    formatDateTime: (ms) => dateTime.format(ms),
    exitToTitle: () => {
      for (const ev of exitPath(game.flow.state)) game.flow.send(ev);
      game.flow.setPaused(false);
    },
  };

  const hud = createHud(
    game,
    () => {
      openPause();
      screens.push(slotsScreen(ctx));
    },
    () => openPause(),
  );
  const subtitles = createSubtitles(game);
  // Subtitles sit under menus; toasts stay on top of everything.
  root.append(subtitles.el, layer, hud.el);

  /** Another system hosts a full screen (e.g. timeline): hide ours and leave input to it. */
  let foreign = false;
  const syncChrome = (): void => {
    hud.setVisible(canPauseIn(game.flow.state) && !game.flow.paused && !foreign, game.flow.isVolatile);
    root.classList.toggle('has-screen', screens.depth > 0);
    hud.setMenuOpen(screens.depth > 0);
    root.classList.toggle('is-yielded', foreign);
    focus.suspended = foreign;
    html.dataset.uiTop = screens.top?.id ?? '';
  };
  const offScreens = screens.onChange(() => {
    focus.refresh();
    syncChrome();
  });
  const checkForeign = (): void => {
    let found = false;
    for (const el of document.querySelectorAll(FOREIGN_SCREEN)) {
      if (!root.contains(el)) {
        found = true;
        break;
      }
    }
    if (found !== foreign) {
      foreign = found;
      syncChrome();
    }
  };
  const observer = new MutationObserver(checkForeign);
  observer.observe(document.body, { childList: true, subtree: true });

  function openPause(): void {
    if (!canPauseIn(game.flow.state)) return;
    if (!game.flow.paused) game.flow.setPaused(true);
    if (!isPauseOpen()) screens.reset(pauseScreen(ctx));
  }

  const showForState = (): void => {
    if (game.flow.state === 'title') screens.reset(titleScreen(ctx));
    else if (!game.flow.paused) screens.clear();
    syncChrome();
  };

  const offs = [
    game.bus.on('flow:changed', showForState),
    game.bus.on('flow:pause-changed', ({ paused }) => {
      if (paused) {
        // Start / Escape on the title screen: nothing to pause.
        if (!canPauseIn(game.flow.state)) game.flow.setPaused(false);
        else if (!isPauseOpen()) screens.reset(pauseScreen(ctx));
        syncChrome();
        return;
      }
      if (game.flow.state === 'title') {
        if (!screens.screens.some((s) => s.id === 'title')) screens.reset(titleScreen(ctx));
      } else {
        screens.clear();
      }
      syncChrome();
    }),
    game.bus.on('settings:changed', ({ key }) => {
      if (key === 'accessibility') applyMotion();
    }),
  ];
  const onMotion = (): void => applyMotion();
  motionQuery?.addEventListener('change', onMotion);

  // Running: menus read input every simulation step. Paused: steps stop, so the frame hook does
  // (input is already updated for that frame) and owns resuming on the pause button.
  const offStep = game.onStep((dt) => focus.tick(dt));
  const offFrame = game.onFrame((dt, paused) => {
    if (!paused) return;
    const input = game.input;
    if (
      isPauseOpen() &&
      pausePressResumes({
        pressedPause: input.justPressed('pause'),
        pressedBack: input.justPressed('back'),
        recentUiKey: performance.now() - focus.lastKeyAt < RECENT_KEY_MS,
      })
    ) {
      resume();
      return;
    }
    focus.tick(Math.min(dt, 0.1));
  });

  // Android Back is the UI's back: pop a screen, open the pause menu in play, never exit silently.
  game.setBackHandler(() => {
    if (foreign) return;
    if (screens.depth > 0) {
      screens.back();
      return;
    }
    openPause();
  });
  const detachFocus = focus.attach(window);
  // Capture phase: runs before the FocusManager's key handling, which may change the stack.
  // A quick key tap can fall between simulation steps, so the UI opens the pause menu from the
  // key event itself; marking it as a UI key keeps the next paused frame from resuming on it.
  // At the pause root the same key resumes on release (a press could likewise be missed, and
  // resuming on press would let the next step read the held key as a new pause).
  let resumeOnRelease = false;
  const isPauseKey = (e: KeyboardEvent): boolean => !!game.input.getBindings().keyboard[e.code]?.includes('pause');
  const onPauseKey = (e: KeyboardEvent): void => {
    if (foreign || e.repeat || !isPauseKey(e)) return;
    if (game.flow.paused) {
      resumeOnRelease = screens.depth === 1 && isPauseOpen();
      return;
    }
    if (screens.depth > 0) return;
    focus.lastKeyAt = performance.now();
    openPause();
  };
  const onPauseKeyUp = (e: KeyboardEvent): void => {
    if (!resumeOnRelease || !isPauseKey(e)) return;
    resumeOnRelease = false;
    if (game.flow.paused && screens.depth === 1 && isPauseOpen()) resume();
  };
  window.addEventListener('keydown', onPauseKey, { capture: true });
  window.addEventListener('keyup', onPauseKeyUp, { capture: true });

  showForState();
  checkForeign();
  if (import.meta.env.VITE_TEST_HOOKS === '1') (window as unknown as { __netivimUi?: unknown }).__netivimUi = { focus, screens };

  return () => {
    game.setBackHandler(null);
    observer.disconnect();
    offStep();
    offFrame();
    detachFocus();
    window.removeEventListener('keydown', onPauseKey, { capture: true });
    window.removeEventListener('keyup', onPauseKeyUp, { capture: true });
    offScreens();
    for (const off of offs) off();
    motionQuery?.removeEventListener('change', onMotion);
    screens.clear();
    hud.dispose();
    subtitles.dispose();
    layer.remove();
  };
}
