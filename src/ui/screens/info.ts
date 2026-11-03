import { panel, type UiContext } from '../context';
import { h } from '../dom';
import type { UiScreen } from '../uiScreen';

/** Placeholder text screen (Archive & Codex, Credits & Sources) until those systems land. */
export function infoScreen(ctx: UiContext, id: string, title: string, paragraphs: readonly string[]): UiScreen {
  const p = panel(ctx, title, { back: true });
  for (const text of paragraphs) p.body.append(h('p', { class: 'nv-prose', text }));
  return { id, el: p.el, scroller: p.body };
}
