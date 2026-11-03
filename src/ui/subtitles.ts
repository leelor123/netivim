import type { Game } from '../game';
import { h } from './dom';

/**
 * Subtitles (subtitle:show / subtitle:clear). Always shown, also when voice narration is off.
 * Size follows settings.accessibility.subtitleSize; text comes from locale keys only.
 */
export function createSubtitles(game: Game): { el: HTMLElement; dispose(): void } {
  const speaker = h('span', { class: 'nv-sub__speaker' });
  const line = h('span', { class: 'nv-sub__line' });
  const box = h('p', { class: 'nv-sub__box' }, speaker, line);
  const el = h('div', { class: 'nv-sub', attrs: { 'aria-live': 'polite', dir: 'rtl' } }, box);
  el.hidden = true;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const applySize = (): void => {
    el.dataset.size = game.settings.value.accessibility.subtitleSize;
  };
  const clear = (): void => {
    clearTimeout(timer);
    el.hidden = true;
    speaker.textContent = '';
    line.textContent = '';
  };
  applySize();

  const offs = [
    game.bus.on('subtitle:show', ({ textKey, speakerKey, durationMs }) => {
      clearTimeout(timer);
      speaker.textContent = speakerKey ? game.i18n.t(speakerKey) : '';
      speaker.hidden = !speakerKey;
      line.textContent = game.i18n.t(textKey);
      el.hidden = false;
      if (durationMs > 0) timer = setTimeout(clear, durationMs);
    }),
    game.bus.on('subtitle:clear', clear),
    game.bus.on('settings:changed', ({ key }) => {
      if (key === 'accessibility') applySize();
    }),
  ];
  return {
    el,
    dispose() {
      clear();
      for (const off of offs) off();
      el.remove();
    },
  };
}
