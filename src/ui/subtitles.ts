import type { Game } from '../game';
import { h } from './dom';
import { SubtitleTimer } from './subtitleTimer';

/**
 * Subtitles (subtitle:show / subtitle:clear). Always shown, also when voice narration is off.
 * Size follows settings.accessibility.subtitleSize; text comes from locale keys only.
 *
 * The visible caption is hidden from assistive tech; a persistent visually hidden live region
 * carries the text instead, so announcements do not depend on a hidden element being revealed.
 * The line's lifetime runs on game time, so it is paused together with the game.
 */
export function createSubtitles(game: Game): { el: HTMLElement; dispose(): void } {
  const speaker = h('span', { class: 'nv-sub__speaker' });
  const line = h('span', { class: 'nv-sub__line' });
  const box = h('p', { class: 'nv-sub__box', attrs: { 'aria-hidden': 'true' } }, speaker, line);
  const visual = h('div', { class: 'nv-sub', attrs: { dir: 'rtl' } }, box);
  const live = h('div', { class: 'nv-sr', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true', dir: 'rtl' } });
  const el = h('div', { class: 'nv-sub-wrap' }, visual, live);
  visual.hidden = true;
  const timer = new SubtitleTimer();

  const applySize = (): void => {
    visual.dataset.size = game.settings.value.accessibility.subtitleSize;
  };
  const clear = (): void => {
    timer.stop();
    visual.hidden = true;
    speaker.textContent = '';
    line.textContent = '';
    live.textContent = '';
  };
  applySize();

  const offs = [
    game.bus.on('subtitle:show', ({ textKey, speakerKey, durationMs }) => {
      const who = speakerKey ? game.i18n.t(speakerKey) : '';
      const text = game.i18n.t(textKey);
      speaker.textContent = who;
      speaker.hidden = !speakerKey;
      line.textContent = text;
      live.textContent = who ? who + ': ' + text : text;
      visual.hidden = false;
      timer.start(durationMs);
    }),
    game.bus.on('subtitle:clear', clear),
    game.onStep((dt) => {
      if (timer.tick(dt)) clear();
    }),
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
