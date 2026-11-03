import { panel, type UiContext } from '../context';
import { focusable, h } from '../dom';
import type { UiScreen } from '../uiScreen';

export interface ChapterEntry {
  readonly id: string;
  /** Locale key of the chapter name. */
  readonly titleKey: string;
  /** Chapter number shown on the card, or null for prologue / epilogue. */
  readonly number: number | null;
  readonly unlocked: boolean;
}

/** Placeholder chapter list (DESIGN 2) until chapter content provides the real one. */
export const CHAPTERS: readonly ChapterEntry[] = [
  { id: 'prologue', titleKey: 'ui.chapter.prologue', number: null, unlocked: true },
  ...Array.from({ length: 11 }, (_, i) => ({ id: 'ch' + String(i + 1), titleKey: 'ui.chapter.ch' + String(i + 1), number: i + 1, unlocked: false })),
  { id: 'epilogue', titleKey: 'ui.chapter.epilogue', number: null, unlocked: false },
];

/** Chapter list; a long list, so it exercises focus scrolling and trigger scrolling. */
export function chaptersScreen(ctx: UiContext, chapters: readonly ChapterEntry[] = CHAPTERS): UiScreen {
  const { t } = ctx;
  const p = panel(ctx, t('ui.chapters.title'), { back: true, wide: true });
  const list = h('ol', { class: 'nv-chapters' });
  let first: HTMLElement | null = null;
  for (const c of chapters) {
    const card = focusable(h('button', { class: 'nv-chapter' + (c.unlocked ? '' : ' is-locked'), attrs: { type: 'button' } }));
    card.dataset.key = 'chapter-' + c.id;
    card.append(
      h('span', { class: 'nv-chapter__num', text: c.number === null ? '·' : t('ui.chapters.number', { n: c.number }) }),
      h('span', { class: 'nv-chapter__title', text: t(c.titleKey) }),
    );
    if (!c.unlocked) {
      card.setAttribute('aria-disabled', 'true');
      card.append(h('span', { class: 'nv-chapter__state', text: t('ui.chapters.locked') }));
    }
    first ??= card;
    list.append(h('li', {}, card));
  }
  p.body.append(list);
  return { id: 'chapters', el: p.el, scroller: p.body, initialFocus: () => first };
}
