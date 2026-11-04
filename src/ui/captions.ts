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

/** Splits a line's duration over its pages by length (each page at least `minMs`). */
export function pageDurations(pages: readonly string[], totalMs: number, minMs = 1800): number[] {
  if (totalMs <= 0) return pages.map(() => 0);
  const total = pages.reduce((n, p) => n + p.length, 0) || 1;
  return pages.map((p) => Math.max(minMs, Math.round((totalMs * p.length) / total)));
}
