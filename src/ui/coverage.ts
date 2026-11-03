/**
 * The last date the game's historical content covers (ISO yyyy-mm-dd). Shown on the title
 * screen as "History covered up to". Update it together with the Chapter 11 content.
 */
export const HISTORY_COVERED_UP_TO = '2026-11-01';

/** Formats an ISO date for the UI in Hebrew (e.g. "1 בנובמבר 2026"), independent of time zone. */
export function formatCoverageDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}
