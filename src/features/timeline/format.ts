import type { KeyEvent } from '../../content/eras';

export type Translate = (key: string, params?: Readonly<Record<string, string | number>>) => string;

/** "29-31 August 1897", "May 1939" or "1882", with Hebrew month names from the locale file. */
export function formatEventDate(event: Pick<KeyEvent, 'year' | 'month' | 'day' | 'endMonth' | 'endDay'>, t: Translate): string {
  const { year, month, day, endMonth, endDay } = event;
  if (month === undefined) return String(year);
  const m = t('timeline.month.' + month);
  if (day === undefined) return m + ' ' + year;
  if (endDay === undefined) return day + ' ב' + m + ' ' + year;
  if (endMonth === undefined || endMonth === month) return day + '–' + endDay + ' ב' + m + ' ' + year;
  return day + ' ב' + m + ' – ' + endDay + ' ב' + t('timeline.month.' + endMonth) + ' ' + year;
}

export function formatYears(years: readonly [number, number]): string {
  return years[0] === years[1] ? String(years[0]) : years[0] + '–' + years[1];
}

/** Tiny DOM builder (textContent only, never innerHTML). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
  attrs: Readonly<Record<string, string>> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}
