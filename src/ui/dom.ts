/** Tiny DOM helpers. Text always goes through textContent (never innerHTML). */

export interface Props {
  readonly class?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Node | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, v);
  for (const c of children) if (c) node.append(c);
  return node;
}

let uid = 0;
/** Unique element id for aria-labelledby links. */
export function nextId(prefix: string): string {
  uid += 1;
  return 'nv-' + prefix + '-' + String(uid);
}

/** Marks an element as reachable by the FocusManager. */
export function focusable<T extends HTMLElement>(el: T): T {
  el.dataset.focusable = '';
  return el;
}
