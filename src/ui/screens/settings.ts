import type { Settings, SettingsSection, GraphicsOptions } from '../../core/settings';
import { ACTIONS, type Action } from '../../core/input/types';
import { DEFAULT_BINDINGS, remapGamepad } from '../../core/input/bindings';
import { dialog, panel, type UiContext } from '../context';
import { focusable, h } from '../dom';
import { resolveGraphics } from '../../render/presets';
import { buttonLabel } from '../glyphs';
import { captureNextGamepadButton } from '../remap';
import type { UiScreen } from '../uiScreen';
import { button, choiceRow, customRow, heading, sliderRow, toggleRow } from '../widgets';

export const SETTINGS_TABS = ['graphics', 'audio', 'accessibility', 'gameplay', 'controls'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

const RESOLUTION_STEPS = [0, 0.5, 0.6, 0.7, 0.8, 0.9, 1] as const;

/** Settings with five tabs. Every change goes through game.settings.update (saved at once). */
export function settingsScreen(ctx: UiContext, initialTab: SettingsTab = 'graphics'): UiScreen {
  const { t, game, rtl } = ctx;
  const p = panel(ctx, t('ui.settings.title'), { back: true, wide: true });
  const tablist = h('div', { class: 'nv-tabs', attrs: { role: 'tablist', 'aria-label': t('ui.settings.tabs') } });
  const tabpanel = h('div', { class: 'nv-tabpanel', attrs: { role: 'tabpanel' } });
  p.header.append(tablist);
  p.body.append(tabpanel);

  const s = (): Settings => game.settings.value;
  const update = <K extends SettingsSection>(k: K, patch: Partial<Settings[K]>): void => {
    game.settings.update(k, patch);
  };
  const pct = (v: number): string => t('ui.common.percent', { n: Math.round(v * 100) });
  const times = (v: number): string => t('ui.common.times', { n: v.toFixed(1) });
  const common = { prevLabel: t('ui.common.prev'), nextLabel: t('ui.common.next') };
  const onOff = { on: t('ui.common.on'), off: t('ui.common.off') };

  const custom = <F extends keyof GraphicsOptions>(field: F, v: GraphicsOptions[F]): void =>
    update('graphics', { custom: { ...s().graphics.custom, [field]: v } });
  const customToggle = (field: 'ambientOcclusion' | 'bloom' | 'fog' | 'colorGrading' | 'depthOfField' | 'motionBlur'): HTMLElement =>
    toggleRow({ label: t('ui.gfx.' + field), key: 'gfx-' + field, ...onOff, get: () => s().graphics.custom[field], set: (v) => custom(field, v) });
  const customSlider = (field: 'particles' | 'vegetation' | 'renderDistance' | 'lodDistance', min: number, max: number, step: number, fmt: (v: number) => string): HTMLElement =>
    sliderRow({ label: t('ui.gfx.' + field), key: 'gfx-' + field, min, max, step, rtl, format: fmt, get: () => s().graphics.custom[field], set: (v) => custom(field, v) });

  const builders: Record<SettingsTab, () => HTMLElement[]> = {
    graphics: () => {
      const g = s().graphics;
      const rows: HTMLElement[] = [
        choiceRow({
          ...common,
          label: t('ui.gfx.mode'),
          key: 'gfx-mode',
          options: ['auto', 'preset', 'custom'] as const,
          text: (v) => t('ui.gfx.mode.' + v),
          get: () => s().graphics.mode,
          set: (v) => {
            update('graphics', { mode: v });
            render('gfx-mode');
          },
          ...(g.mode === 'auto' ? { note: t('ui.gfx.autoNote') } : {}),
        }),
      ];
      // What the pipeline runs now (Auto: the benchmark result once it has run).
      const active = resolveGraphics(g).preset;
      const activeText = active ? t('ui.gfx.preset.' + active) : t('ui.gfx.mode.custom');
      rows.push(
        h('p', {
          class: 'nv-note nv-note--status',
          text:
            g.mode === 'auto'
              ? g.benchmarked
                ? t('ui.gfx.benchmarked', { preset: activeText })
                : t('ui.gfx.benchmarkPending')
              : t('ui.gfx.active', { preset: activeText }),
        }),
      );
      if (g.mode === 'preset') {
        rows.push(
          choiceRow({
            ...common,
            label: t('ui.gfx.preset'),
            key: 'gfx-preset',
            options: ['battery', 'low', 'medium', 'high', 'ultra'] as const,
            text: (v) => t('ui.gfx.preset.' + v),
            get: () => s().graphics.preset,
            set: (v) => update('graphics', { preset: v }),
          }),
        );
      }
      if (g.mode === 'custom') {
        rows.push(
          heading(t('ui.gfx.customTitle')),
          choiceRow({
            ...common,
            label: t('ui.gfx.resolutionScale'),
            key: 'gfx-resolutionScale',
            options: RESOLUTION_STEPS,
            text: (v) => (v === 0 ? t('ui.gfx.native') : pct(v)),
            get: () => {
              const v = s().graphics.custom.resolutionScale;
              return RESOLUTION_STEPS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
            },
            set: (v) => custom('resolutionScale', v),
          }),
          choiceRow({
            ...common,
            label: t('ui.gfx.fpsCap'),
            key: 'gfx-fpsCap',
            options: [30, 60, 0] as const,
            text: (v) => (v === 0 ? t('ui.gfx.fps.unlocked') : String(v)),
            get: () => s().graphics.custom.fpsCap,
            set: (v) => custom('fpsCap', v),
          }),
          choiceRow({
            ...common,
            label: t('ui.gfx.shadows'),
            key: 'gfx-shadows',
            options: ['off', 'low', 'medium', 'high', 'ultra'] as const,
            text: (v) => t('ui.gfx.quality.' + v),
            get: () => s().graphics.custom.shadows,
            set: (v) => custom('shadows', v),
          }),
          choiceRow({
            ...common,
            label: t('ui.gfx.antialias'),
            key: 'gfx-antialias',
            options: ['none', 'fxaa', 'smaa', 'msaa'] as const,
            text: (v) => (v === 'none' ? t('ui.gfx.aa.none') : v.toUpperCase()),
            get: () => s().graphics.custom.antialias,
            set: (v) => custom('antialias', v),
          }),
          customToggle('ambientOcclusion'),
          customToggle('bloom'),
          customToggle('fog'),
          customSlider('particles', 0, 1, 0.05, pct),
          customSlider('vegetation', 0, 1, 0.05, pct),
          customSlider('renderDistance', 0.5, 1.5, 0.1, times),
          customSlider('lodDistance', 0.5, 1.5, 0.1, times),
          customToggle('colorGrading'),
          customToggle('depthOfField'),
          customToggle('motionBlur'),
        );
      }
      rows.push(
        toggleRow({ label: t('ui.gfx.debugOverlay'), key: 'gfx-debugOverlay', ...onOff, get: () => s().graphics.debugOverlay, set: (v) => update('graphics', { debugOverlay: v }) }),
      );
      return rows;
    },
    audio: () => {
      const vol = (field: 'master' | 'music' | 'sfx' | 'narration'): HTMLElement =>
        sliderRow({ label: t('ui.audio.' + field), key: 'audio-' + field, min: 0, max: 1, step: 0.05, rtl, format: pct, get: () => s().audio[field], set: (v) => update('audio', { [field]: v }) });
      return [
        vol('master'),
        vol('music'),
        vol('sfx'),
        vol('narration'),
        toggleRow({ label: t('ui.audio.voice'), key: 'audio-voice', ...onOff, get: () => s().audio.voice, set: (v) => update('audio', { voice: v }) }),
        h('p', { class: 'nv-note', text: t('ui.audio.voiceNote') }),
      ];
    },
    accessibility: () => [
      choiceRow({
        ...common,
        label: t('ui.a11y.subtitleSize'),
        key: 'a11y-subtitleSize',
        options: ['small', 'medium', 'large', 'xlarge'] as const,
        text: (v) => t('ui.a11y.size.' + v),
        get: () => s().accessibility.subtitleSize,
        set: (v) => update('accessibility', { subtitleSize: v }),
      }),
      toggleRow({ label: t('ui.a11y.reducedMotion'), key: 'a11y-reducedMotion', ...onOff, get: () => s().accessibility.reducedMotion, set: (v) => update('accessibility', { reducedMotion: v }) }),
      choiceRow({
        ...common,
        label: t('ui.a11y.contentIntensity'),
        key: 'a11y-contentIntensity',
        note: t('ui.a11y.intensityNote'),
        options: ['gentle', 'standard'] as const,
        text: (v) => t('ui.a11y.intensity.' + v),
        get: () => s().accessibility.contentIntensity,
        set: (v) => update('accessibility', { contentIntensity: v }),
      }),
    ],
    gameplay: () => [
      choiceRow({
        ...common,
        label: t('ui.gameplay.difficulty'),
        key: 'gameplay-difficulty',
        note: t('ui.gameplay.difficultyNote'),
        options: ['story', 'normal', 'challenge'] as const,
        text: (v) => t('ui.gameplay.' + v),
        get: () => s().gameplay.difficulty,
        set: (v) => update('gameplay', { difficulty: v }),
      }),
    ],
    controls: () => {
      const rows: HTMLElement[] = [
        toggleRow({ label: t('ui.controls.vibration'), key: 'controls-vibration', ...onOff, get: () => s().controls.vibration, set: (v) => update('controls', { vibration: v }) }),
        sliderRow({ label: t('ui.controls.touchSize'), key: 'controls-touchSize', min: 0.75, max: 1.5, step: 0.05, rtl, format: pct, get: () => s().controls.touchSize, set: (v) => update('controls', { touchSize: v }) }),
        sliderRow({ label: t('ui.controls.touchOpacity'), key: 'controls-touchOpacity', min: 0.3, max: 1, step: 0.05, rtl, format: pct, get: () => s().controls.touchOpacity, set: (v) => update('controls', { touchOpacity: v }) }),
        choiceRow({
          ...common,
          label: t('ui.controls.touchLayout'),
          key: 'controls-touchLayout',
          options: ['right-handed', 'left-handed'] as const,
          text: (v) => t(v === 'right-handed' ? 'ui.controls.layout.right' : 'ui.controls.layout.left'),
          get: () => s().controls.touchLayout,
          set: (v) => update('controls', { touchLayout: v }),
        }),
        heading(t('ui.controls.remapTitle')),
        h('p', { class: 'nv-note', text: t('ui.controls.remapHint') }),
      ];
      for (const action of ACTIONS) rows.push(remapRow(action));
      rows.push(
        h(
          'div',
          { class: 'nv-row nv-row--action' },
          button(
            t('ui.controls.reset'),
            () => {
              applyBindings(DEFAULT_BINDINGS);
              render('controls-reset');
            },
            { variant: 'quiet', key: 'controls-reset' },
          ),
        ),
      );
      return rows;
    },
  };

  const applyBindings = (b: Settings['controls']['bindings']): void => {
    // game.ts applies controls bindings to the input manager on settings:changed.
    update('controls', { bindings: b });
  };

  const buttonsFor = (action: Action): string => {
    const names: string[] = [];
    for (const [k, list] of Object.entries(s().controls.bindings.gamepad)) {
      // Same family glyphs / names as the prompts everywhere else (PlayStation shapes, Xbox letters...).
      if (list.includes(action)) names.push(buttonLabel(Number(k), ctx.game.input.family));
    }
    return names.length > 0 ? names.join(' · ') : t('ui.controls.unbound');
  };

  function remapRow(action: Action): HTMLElement {
    const control = focusable(h('button', { class: 'nv-remap', attrs: { type: 'button' } }));
    control.dataset.key = 'remap-' + action;
    control.append(h('span', { class: 'nv-remap__value', text: buttonsFor(action) }));
    control.addEventListener('click', () => {
      void capture(action);
    });
    return customRow(t('ui.action.' + action), 'remap-' + action, control);
  }

  async function capture(action: Action): Promise<void> {
    const abort = new AbortController();
    const prompt = dialog('remap-capture', t('ui.controls.capture'), t('ui.controls.captureFor', { action: t('ui.action.' + action) }) + ' ' + t('ui.controls.captureCancelHint'), [
      { label: t('ui.common.cancel'), run: () => abort.abort() },
    ]);
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Escape' || e.code === 'Backspace') abort.abort();
    };
    window.addEventListener('keydown', onKey);
    ctx.screens.push(prompt);
    ctx.focus.suspended = true;
    // Holding the Back button for a second cancels (a quick press still binds it, like any button).
    const backButtons = Object.entries(s().controls.bindings.gamepad)
      .filter(([, list]) => list.includes('back'))
      .map(([k]) => Number(k));
    const button = await captureNextGamepadButton({ signal: abort.signal, holdCancelButtons: backButtons });
    window.removeEventListener('keydown', onKey);
    ctx.focus.suspended = false;
    if (ctx.screens.top === prompt) ctx.screens.pop();
    if (button !== null) {
      const others = (s().controls.bindings.gamepad[button] ?? []).filter((a) => a !== action);
      applyBindings(remapGamepad(s().controls.bindings, action, button));
      render('remap-' + action);
      // A button may serve two actions; say so instead of letting it happen silently.
      if (others.length > 0) ctx.game.bus.emit('ui:toast', { textKey: 'ui.controls.sharedButton', params: { action: others.map((a) => t('ui.action.' + a)).join(', ') } });
    }
  }

  let current: SettingsTab = initialTab;
  const tabs = new Map<SettingsTab, HTMLButtonElement>();
  for (const id of SETTINGS_TABS) {
    const tab = focusable(h('button', { class: 'nv-tab', text: t('ui.settings.tab.' + id), attrs: { type: 'button', role: 'tab' } }));
    tab.dataset.key = 'tab-' + id;
    tab.addEventListener('click', () => select(id));
    tabs.set(id, tab);
    tablist.append(tab);
  }

  function render(focusKey?: string): void {
    for (const [id, tab] of tabs) {
      tab.setAttribute('aria-selected', String(id === current));
      tab.classList.toggle('is-active', id === current);
    }
    tabpanel.setAttribute('aria-label', t('ui.settings.tab.' + current));
    tabpanel.replaceChildren(...builders[current]());
    tabpanel.dataset.tab = current;
    if (focusKey) ctx.focus.refocusKey(focusKey);
  }

  function select(id: SettingsTab, focusFirst = false): void {
    if (id === current && !focusFirst) return;
    current = id;
    p.body.scrollTop = 0;
    render();
    if (focusFirst) ctx.focus.refocusKey('tab-' + id);
  }

  render();
  return {
    id: 'settings',
    el: p.el,
    scroller: p.body,
    initialFocus: () => tabpanel.querySelector<HTMLElement>('[data-focusable]'),
    tab: (delta) => {
      const i = SETTINGS_TABS.indexOf(current);
      const next = SETTINGS_TABS[(i + delta + SETTINGS_TABS.length) % SETTINGS_TABS.length] as SettingsTab;
      select(next, true);
      return true;
    },
  };
}
