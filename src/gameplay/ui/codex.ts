import type { ArchiveItem, CodexCategory, CodexEntry } from '../../content/schema';
import type { Action } from '../../core/input/types';
import { h } from '../../ui/dom';
import { scrollableAttrs } from '../../ui/scrollRouting';
import type { ChapterDefinition } from '../types';
import { findByKey, FOCUS_ATTR, gpButton, rerenderKeepingFocus, type GpScreen } from './host';
import { fill, labelChip, sourcesLine, type T } from './screens';

/** Codex categories shown as tabs (BRIEF mandatory system 2). */
export const CODEX_TABS: readonly ('all' | CodexCategory)[] = ['all', 'person', 'unit', 'place', 'operation', 'treaty', 'organization', 'event', 'concept'];

/** Pure filter used by the screen and the unit tests. Matches the translated title and body. */
export function filterCodex(entries: readonly CodexEntry[], tab: 'all' | CodexCategory, query: string, t: T): CodexEntry[] {
  const q = query.trim().toLocaleLowerCase('he');
  return entries
    .filter((e) => (tab === 'all' || e.category === tab) && (q === '' || t(e.titleKey).toLocaleLowerCase('he').includes(q) || t(e.bodyKey).toLocaleLowerCase('he').includes(q)))
    .sort((a, b) => a.year - b.year || t(a.titleKey).localeCompare(t(b.titleKey), 'he'));
}

export function codexScreen(t: T, chapters: readonly ChapterDefinition[], unlocked: ReadonlySet<string>, onBack: () => void): GpScreen {
  const all = chapters.flatMap((c) => c.content.codex);
  const open = all.filter((e) => unlocked.has(e.id));
  let tab = 0;
  const search = h('input', { class: 'gp-search', attrs: { type: 'search', [FOCUS_ATTR]: '', 'aria-label': t('gameplay.codex.search'), placeholder: t('gameplay.codex.search') } });
  const tabs = h('div', { class: 'gp-tabs', attrs: { role: 'tablist' } });
  const list = h('div', { class: 'gp-entries', attrs: { id: 'gp-codex-list', role: 'tabpanel' } });
  const detail = h('article', { class: 'gp-detail', attrs: { 'aria-live': 'polite' } });
  const count = h('p', { class: 'gp-dim' });

  const show = (e: CodexEntry): void => {
    fill(detail, 
      h('h3', { class: 'gp-subtitle', text: t(e.titleKey) }),
      h('p', { class: 'gp-kicker' }, document.createTextNode(t('gameplay.codex.cat.' + e.category) + ' · ' + String(e.year) + ' · '), labelChip(t, e.label)),
      h('p', { text: t(e.bodyKey) }),
      sourcesLine(t, e.sources),
    );
  };
  const renderTabs = (): void => {
    tabs.replaceChildren(
      ...CODEX_TABS.map((c, i) => {
        const b = h('button', {
          class: 'gp-tab' + (i === tab ? ' is-active' : ''),
          text: t('gameplay.codex.cat.' + c),
          attrs: { type: 'button', role: 'tab', 'aria-selected': String(i === tab), 'aria-controls': 'gp-codex-list', [FOCUS_ATTR]: '' },
        });
        b.dataset.key = 'codex-tab-' + c;
        b.addEventListener('click', () => select(i));
        return b;
      }),
    );
  };
  const render = (): void => {
    const cat = CODEX_TABS[tab] ?? 'all';
    const shown = filterCodex(open, cat, search.value, t);
    list.replaceChildren(...shown.map((e) => gpButton(t(e.titleKey), () => show(e), { key: 'codex-' + e.id, sub: String(e.year) })));
    count.textContent = t('gameplay.codex.count', { open: open.length, total: all.length });
    if (shown.length === 0) list.append(h('p', { class: 'gp-dim', text: t(open.length === 0 ? 'gameplay.codex.empty' : 'gameplay.codex.noMatch') }));
  };
  /** Switches category (click, touch, Enter, or LB / RB) and keeps focus on the chosen tab. */
  const select = (i: number): void => {
    tab = (i + CODEX_TABS.length) % CODEX_TABS.length;
    renderTabs();
    render();
    const cat = CODEX_TABS[tab] ?? 'all';
    findByKey(tabs, 'codex-tab-' + cat)?.focus({ preventScroll: true });
  };
  search.addEventListener('input', () => rerenderKeepingFocus(list, render));
  renderTabs();
  render();
  const el = h(
    'div',
    { class: 'gp-stage' },
    h(
      'section',
      { class: 'gp-sheet gp-sheet--wide', attrs: { role: 'dialog', 'aria-label': t('gameplay.codex.title') } },
      h('h2', { class: 'gp-sheet__title', text: t('gameplay.codex.title') }),
      h('div', { class: 'gp-sheet__body', attrs: scrollableAttrs(t('gameplay.codex.title')) }, search, tabs, count, h('div', { class: 'gp-split' }, list, detail), h('div', { class: 'gp-actions' }, gpButton(t('gameplay.common.back'), onBack, { key: 'codex-back' }))),
    ),
  );
  return {
    id: 'codex',
    el,
    back: onBack,
    onAction(a: Action) {
      if (a !== 'tabPrev' && a !== 'tabNext') return false;
      select(tab + (a === 'tabNext' ? 1 : -1));
      return true;
    },
  };
}

export interface ArchiveEntry {
  readonly item: ArchiveItem;
  readonly chapterTitleKey: string;
}

export function archiveListScreen(t: T, chapters: readonly ChapterDefinition[], unlocked: ReadonlySet<string>, onOpen: (e: ArchiveEntry) => void, onBack: () => void): GpScreen {
  const entries: ArchiveEntry[] = chapters.flatMap((c) => c.content.archive.map((item) => ({ item, chapterTitleKey: c.content.titleKey })));
  const open = entries.filter((e) => unlocked.has(e.item.id)).sort((a, b) => a.item.year - b.item.year);
  const list = h('div', { class: 'gp-entries' }, ...open.map((e) => gpButton(t(e.item.titleKey), () => onOpen(e), { key: 'archive-' + e.item.id, sub: String(e.item.year) + ' · ' + t('gameplay.license.' + e.item.license) })));
  if (open.length === 0) list.append(h('p', { class: 'gp-dim', text: t('gameplay.archive.empty') }));
  const el = h(
    'div',
    { class: 'gp-stage' },
    h(
      'section',
      { class: 'gp-sheet', attrs: { role: 'dialog', 'aria-label': t('gameplay.archive.title') } },
      h('h2', { class: 'gp-sheet__title', text: t('gameplay.archive.title') }),
      h('div', { class: 'gp-sheet__body', attrs: scrollableAttrs(t('gameplay.archive.title')) }, h('p', { class: 'gp-dim', text: t('gameplay.archive.count', { open: open.length, total: entries.length }) }), list, h('div', { class: 'gp-actions' }, gpButton(t('gameplay.common.back'), onBack, { key: 'archive-back' }))),
    ),
  );
  return { id: 'archive', el, back: onBack };
}

/**
 * Provenance card over the 3D viewer: who made it, when, why it may be shown, labels.
 * Title, scrolling body, fixed footer: the card never grows past the viewer, and Back stays on
 * screen however long the text or large the UI text size (gameplay.css .gp-provenance).
 */
export function provenanceScreen(t: T, e: ArchiveEntry, onBack: () => void): GpScreen {
  const it = e.item;
  const card = h(
    'aside',
    { class: 'gp-provenance', attrs: { role: 'dialog', 'aria-label': t(it.titleKey) } },
    h('h2', { class: 'gp-sheet__title', text: t(it.titleKey) }),
    h(
      'div',
      { class: 'gp-provenance__body', attrs: scrollableAttrs(t(it.titleKey)) },
      h('p', { class: 'gp-kicker' }, document.createTextNode(t(e.chapterTitleKey) + ' · ' + String(it.year) + ' · '), labelChip(t, it.label)),
      h('p', { text: t(it.descriptionKey) }),
      h('h3', { class: 'gp-subtitle', text: t('gameplay.archive.provenance') }),
      h('p', { text: t(it.provenanceKey) }),
      h('p', { class: 'gp-license', text: t('gameplay.license.' + it.license) }),
      sourcesLine(t, it.sources),
      h('p', { class: 'gp-dim', text: t('gameplay.archive.rotate') }),
    ),
    h('div', { class: 'gp-provenance__foot' }, h('div', { class: 'gp-actions' }, gpButton(t('gameplay.common.back'), onBack, { key: 'viewer-back', primary: true }))),
  );
  return { id: 'archive-viewer', el: h('div', { class: 'gp-viewer' }, card), back: onBack };
}
