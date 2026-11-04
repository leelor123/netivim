/**
 * Caption logic (pure): one caption = optional speaker + optional content-label chip + text.
 * Subtitles, testimonies and guide lines all go through this single component, so two caption
 * boxes can never stack on top of each other.
 */

export type CaptionLabel = 'documented' | 'reconstructed' | 'composite';

export interface CaptionInput {
  readonly speaker: string | null;
  readonly label: CaptionLabel | null;
  readonly text: string;
}

export interface CaptionHead {
  /** Shown name ('' when none). */
  readonly speaker: string;
  /** Label chip, or null. */
  readonly label: CaptionLabel | null;
  /** False when there is nothing to show above the text. */
  readonly visible: boolean;
}

/**
 * Merges the speaker and the label of a line into one caption head. A labeled line without a
 * speaker (an archival testimony) is introduced by `testimonyWord`.
 */
export function captionHead(input: Pick<CaptionInput, 'speaker' | 'label'>, testimonyWord: string): CaptionHead {
  const speaker = input.speaker ?? (input.label ? testimonyWord : '');
  return { speaker, label: input.label, visible: speaker !== '' || input.label !== null };
}

/** Approximate glyph width / font size for Heebo (Hebrew), used to fit text to the region. */
const GLYPH_EM = 0.55;
const LINE_EM = 1.4;
/** Readability cap per line (matches the 46ch max width in CSS). */
const MAX_CHARS_PER_LINE = 46;

/** How many characters fit in one caption page for a region and a font size (CSS px). */
export function captionCapacity(regionW: number, regionH: number, fontPx: number, withHead: boolean): number {
  const padX = fontPx * 1.6;
  const padY = fontPx * 0.8 + (withHead ? fontPx * 1.1 : 0);
  const perLine = Math.max(8, Math.min(MAX_CHARS_PER_LINE, Math.floor((regionW - padX) / (fontPx * GLYPH_EM))));
  const lines = Math.max(1, Math.floor((regionH - padY) / (fontPx * LINE_EM)));
  return perLine * lines;
}

/**
 * Splits a long line into pages that each fit `maxChars`, breaking after sentences where
 * possible, else between words; a single over-long word gets a page of its own. Never loses or
 * reorders text. Short text returns a single page.
 */
export function paginateCaption(text: string, maxChars: number): string[] {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= maxChars || maxChars <= 0) return [clean];
  const pages: string[] = [];
  let cur = '';
  for (const w of clean.split(' ')) {
    const next = cur === '' ? w : cur + ' ' + w;
    if (next.length <= maxChars || cur === '') {
      cur = next;
      continue;
    }
    // Prefer to break after the last sentence end if that keeps the page at least half full.
    const cut = lastSentenceEnd(cur);
    if (cut > maxChars / 2 && cut < cur.length) {
      pages.push(cur.slice(0, cut));
      const rest = cur.slice(cut + 1) + ' ' + w;
      if (rest.length <= maxChars) cur = rest;
      else {
        pages.push(cur.slice(cut + 1));
        cur = w;
      }
    } else {
      pages.push(cur);
      cur = w;
    }
  }
  if (cur !== '') pages.push(cur);
  return pages;
}

/** Index just after the last sentence-ending word in `s` (-1 if none). */
function lastSentenceEnd(s: string): number {
  let best = -1;
  for (let i = 0; i < s.length; i++) {
    if ('.!?:;'.includes(s.charAt(i)) && (i === s.length - 1 || s.charAt(i + 1) === ' ')) best = i + 1;
  }
  return best;
}

/** Shortest time a caption page stays on screen (ms). */
export const MIN_PAGE_MS = 1000;
/** Reading pace for the non-last pages of a persistent line (ms per character, floored at MIN_PAGE_MS). */
export const PERSISTENT_PAGE_MS_PER_CHAR = 70;

/**
 * Page timing contract (no page is ever skipped):
 * - Timed line (`totalMs > 0`): every page gets `minMs`, the rest of `totalMs` is split by page
 *   length, and the durations sum to exactly `totalMs`. When even `pages.length * minMs` does not
 *   fit, every page gets `minMs` and the sum is larger than `totalMs`: the caption then asks the
 *   line's owner to hold the line that long (subtitle:extend, see captionHoldMs).
 * - Persistent line (`totalMs <= 0`): every page but the last gets a reading-time duration; the
 *   last page gets 0 and stays until subtitle:clear (or the next subtitle:show).
 */
export function pageDurations(pages: readonly string[], totalMs: number, minMs = MIN_PAGE_MS): number[] {
  if (pages.length === 0) return [];
  if (totalMs <= 0) {
    return pages.map((p, i) => (i === pages.length - 1 ? 0 : Math.max(minMs, Math.round(p.length * PERSISTENT_PAGE_MS_PER_CHAR))));
  }
  const budget = Math.max(Math.round(totalMs), pages.length * minMs);
  const spare = budget - pages.length * minMs;
  const chars = pages.reduce((n, p) => n + p.length, 0);
  // Cumulative rounding keeps the sum exact (= budget) and each page at least minMs.
  const out: number[] = [];
  let acc = 0;
  let given = 0;
  for (const p of pages) {
    acc += chars > 0 ? p.length : 1;
    const upTo = Math.round((spare * acc) / (chars > 0 ? chars : pages.length));
    out.push(minMs + upTo - given);
    given = upTo;
  }
  return out;
}

/**
 * How long the line must stay current so every page is shown: the sum of the page durations, or
 * 0 for a persistent line whose last page has no timeout (it holds until cleared).
 */
export function captionHoldMs(durations: readonly number[]): number {
  return durations.reduce((n, d) => n + d, 0);
}

export interface CaptionPlan {
  readonly pages: string[];
  readonly durations: number[];
  /** captionHoldMs(durations). Larger than the line's durationMs when paging needs more time. */
  readonly holdMs: number;
}

/** Pages a line for a caption capacity and times its pages (see pageDurations). */
export function planCaption(text: string, capacity: number, durationMs: number): CaptionPlan {
  const pages = paginateCaption(text, capacity);
  const durations = pageDurations(pages, durationMs);
  return { pages, durations, holdMs: captionHoldMs(durations) };
}
