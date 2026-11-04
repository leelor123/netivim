import type { Game } from '../game';
import { captionCapacity, captionHead, pageDurations, paginateCaption } from './captions';
import { h } from './dom';
import { activeLayout } from './layout';
import { SubtitleTimer } from './subtitleTimer';

/** Caption font size per settings.accessibility.subtitleSize (CSS px; mirrors ui.css). */
const SIZE_PX = { small: 15, medium: 18, large: 23, xlarge: 28 } as const;

/**
 * THE caption component (subtitle:show / subtitle:clear), in the "captions" screen region.
 * One box: speaker + content-label chip + text. Testimonies and guide lines carry their label on
 * the line itself, so no second label box can ever stack over the subtitle. Long text is paged
 * to fit the region. Always shown, also when voice narration is off; text from locale keys only.
 *
 * The visible caption is hidden from assistive tech; a persistent visually hidden live region
 * carries the full line instead. Lifetimes run on game time, so they pause with the game.
 */
export function createSubtitles(game: Game): { el: HTMLElement; dispose(): void } {
  const { t } = game.i18n;
  const speaker = h('span', { class: 'nv-sub__speaker' });
  const label = h('span', { class: 'nv-sub__label' });
  const head = h('span', { class: 'nv-sub__head' }, speaker, label);
  const line = h('span', { class: 'nv-sub__line' });
  const box = h('p', { class: 'nv-sub__box', attrs: { 'aria-hidden': 'true' } }, head, line);
  const visual = h('div', { class: 'nv-sub', attrs: { dir: 'rtl' } }, box);
  const live = h('div', { class: 'nv-sr', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true', dir: 'rtl' } });
  const el = h('div', { class: 'nv-sub-wrap' }, visual, live);
  visual.hidden = true;
  const timer = new SubtitleTimer();
  let pages: string[] = [];
  let durations: number[] = [];
  let page = 0;

  const applySize = (): void => {
    visual.dataset.size = game.settings.value.accessibility.subtitleSize;
  };
  const clear = (): void => {
    timer.stop();
    visual.hidden = true;
    pages = [];
    page = 0;
    speaker.textContent = '';
    line.textContent = '';
    live.textContent = '';
  };
  const showPage = (): void => {
    line.textContent = pages[page] ?? '';
    timer.start(durations[page] ?? 0);
  };
  applySize();

  const offs = [
    game.bus.on('subtitle:show', ({ textKey, speakerKey, durationMs, label: lineLabel }) => {
      const who = speakerKey ? t(speakerKey) : null;
      const text = t(textKey);
      const hd = captionHead({ speaker: who, label: lineLabel ?? null }, t('gameplay.hud.testimony'));
      speaker.textContent = hd.speaker;
      head.hidden = !hd.visible;
      label.hidden = !hd.label;
      if (hd.label) {
        label.dataset.label = hd.label;
        label.textContent = t('gameplay.label.' + hd.label);
      }
      const region = activeLayout()?.regions.captions;
      const cap = region ? captionCapacity(region.w, region.h, SIZE_PX[game.settings.value.accessibility.subtitleSize], hd.visible) : Infinity;
      pages = paginateCaption(text, cap);
      durations = pageDurations(pages, durationMs);
      page = 0;
      const announced = hd.label && hd.speaker ? hd.speaker + ' (' + t('gameplay.label.' + hd.label) + ')' : hd.speaker;
      live.textContent = announced ? announced + ': ' + text : text;
      visual.hidden = false;
      showPage();
    }),
    game.bus.on('subtitle:clear', clear),
    game.onStep((dt) => {
      if (!timer.tick(dt)) return;
      if (page + 1 < pages.length) {
        page += 1;
        showPage();
      } else clear();
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
