import './ui.css';
import type { Game } from '../game';
import type { UiContext } from './context';
import { h } from './dom';
import { FocusManager } from './focusManager';
import { installFonts } from './fonts';
import { createHud } from './hud';
import { canPauseIn, exitPath, shouldVetoResume } from './logic';
import { ScreenManager } from './screenManager';
import { pauseScreen, slotsScreen, type PauseScreen } from './screens/pause';
import { titleScreen } from './screens/title';
import { createSubtitles } from './subtitles';
import { DomScreenHost, type UiScreen } from './uiScreen';

/** A key handled by the UI this recently blocks the game loop's own resume on that key. */
const RECENT_KEY_MS = 300;
const PAUSED_TICK_MS = 8;

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
  let uiDepth = 0;
  const withUi = (fn: () => void): void => {
    uiDepth++;
    try {
      fn();
    } finally {
      uiDepth--;
    }
  };
  const isPauseOpen = (): boolean => screens.screens[0]?.id === 'pause';
  const focus = new FocusManager({
    input: game.input,
    screens,
    rtl,
    now: () => performance.now(),
    reducedMotion,
    // At the pause root the game loop resumes on the pause key itself.
    deferPauseKey: () => game.flow.paused && screens.depth === 1 && isPauseOpen(),
  });

  const dateTime = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  const ctx: UiContext = {
    game,
    t: (key, params) => game.i18n.t(key, params),
    rtl,
    screens,
    focus,
    withUi,
    formatDateTime: (ms) => dateTime.format(ms),
    exitToTitle: () =>
      withUi(() => {
        for (const ev of exitPath(game.flow.state)) game.flow.send(ev);
        game.flow.setPaused(false);
      }),
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

  let pause: PauseScreen | null = null;
  const syncChrome = (): void => {
    const state = game.flow.state;
    hud.setVisible(canPauseIn(state) && !game.flow.paused, game.flow.isVolatile);
    root.classList.toggle('has-screen', screens.depth > 0);
    html.dataset.uiScreen = screens.top?.id ?? '';
  };
  const offScreens = screens.onChange(() => {
    focus.refresh();
    syncChrome();
  });

  function openPause(): void {
    if (!game.flow.paused) withUi(() => game.flow.setPaused(true));
    if (!isPauseOpen()) {
      pause = pauseScreen(ctx);
      screens.reset(pause);
    }
  }

  const showForState = (): void => {
    if (game.flow.state === 'title') screens.reset(titleScreen(ctx));
    else if (!game.flow.paused) screens.clear();
    syncChrome();
  };

  // While paused the simulation (and game.onStep) stops; the UI keeps polling input on its own.
  let pausedTimer: ReturnType<typeof setInterval> | undefined;
  // Input only changes when a frame runs, so game time while paused is counted in rendered frames.
  let lastFrame = 0;
  const startPausedTicker = (): void => {
    if (pausedTimer !== undefined) return;
    lastFrame = game.renderer.info.render.frame;
    pausedTimer = setInterval(() => {
      const frame = game.renderer.info.render.frame;
      focus.tick(Math.min(5, frame - lastFrame) / 60);
      lastFrame = frame;
    }, PAUSED_TICK_MS);
  };
  const stopPausedTicker = (): void => {
    clearInterval(pausedTimer);
    pausedTimer = undefined;
  };

  const offs = [
    game.bus.on('flow:changed', showForState),
    game.bus.on('flow:pause-changed', ({ paused }) => {
      if (paused) {
        if (!canPauseIn(game.flow.state)) {
          // Start / Escape on the title screen: nothing to pause.
          withUi(() => game.flow.setPaused(false));
          return;
        }
        startPausedTicker();
        if (!isPauseOpen()) {
          pause = pauseScreen(ctx);
          screens.reset(pause);
        }
        syncChrome();
        return;
      }
      const veto = shouldVetoResume({
        uiInitiated: uiDepth > 0,
        pauseOpen: isPauseOpen(),
        depth: screens.depth,
        pressedPause: game.input.justPressed('pause'),
        pressedBack: game.input.justPressed('back'),
        pressedConfirm: game.input.justPressed('confirm'),
        resumeFocused: !!pause && focus.current === pause.resumeButton,
        recentUiKey: performance.now() - focus.lastKeyAt < RECENT_KEY_MS,
      });
      if (veto) {
        // The press belongs to the menu (the FocusManager acts on it); stay paused.
        withUi(() => game.flow.setPaused(true));
        return;
      }
      stopPausedTicker();
      pause = null;
      if (game.flow.state === 'title') {
        if (screens.top?.id !== 'title' && !screens.screens.some((s) => s.id === 'title')) screens.reset(titleScreen(ctx));
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
  const offStep = game.onStep((dt) => focus.tick(dt));
  const detachFocus = focus.attach(window);

  showForState();
  if (import.meta.env.VITE_TEST_HOOKS === '1') (window as unknown as { __netivimUi?: unknown }).__netivimUi = { focus, screens };

  return () => {
    stopPausedTicker();
    offStep();
    detachFocus();
    offScreens();
    for (const off of offs) off();
    motionQuery?.removeEventListener('change', onMotion);
    screens.clear();
    hud.dispose();
    subtitles.dispose();
    layer.remove();
  };
}
