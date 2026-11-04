import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allEvents, chapterStatus, CHAPTER_IDS, ERAS, getEra, type KeyEvent } from '../../src/content/eras';
import { HEBREW } from '../../src/locales';
import { formatEventDate, formatYears } from '../../src/features/timeline/format';
import { LENS_SETS } from '../../src/features/livingMap/lenses';
import { LINE_LAYERS } from '../../src/features/livingMap/layers';
import { MARKERS } from '../../src/features/livingMap/markers';
import { createI18n } from '../../src/core/i18n';

/**
 * Valid source IDs: the master register SOURCES.md (verified, merged by fact-checkers) plus the
 * per-chapter research register for the chapter not yet fact-checked (ch02).
 */
function registerIds(): Set<string> {
  const ids = new Set<string>();
  for (const f of ['SOURCES.md', 'research/sources-ch02.md']) {
    const text = readFileSync(join(__dirname, '../..', f), 'utf8');
    for (const m of text.matchAll(/^(?:\|\s*)?`?((?:P|C1|C2)-\d{3})`?\s*\|/gm)) ids.add(m[1] as string);
  }
  return ids;
}

const SOURCE_IDS = registerIds();
const DESIGN_ORDER = ['prologue', 'ch01', 'ch02', 'ch03', 'ch04', 'ch05', 'ch06', 'ch07', 'ch08', 'ch09', 'ch10', 'ch11', 'epilogue'];

describe('source registers', () => {
  it('are parsed (sanity)', () => {
    // P-001 is a Wikipedia index entry and deliberately absent from the verified register.
    expect(SOURCE_IDS.has('P-001')).toBe(false);
    expect(SOURCE_IDS.has('P-009')).toBe(true);
    expect(SOURCE_IDS.has('C1-001')).toBe(true);
    expect(SOURCE_IDS.has('C2-001')).toBe(true);
  });
});

describe('eras integrity', () => {
  it('lists chapters in DESIGN order', () => {
    expect([...CHAPTER_IDS]).toEqual(DESIGN_ORDER);
    expect(ERAS.map((e) => e.id)).toEqual(DESIGN_ORDER);
  });

  it('keeps years ordered', () => {
    for (const e of ERAS) expect(e.years[0]).toBeLessThanOrEqual(e.years[1]);
    for (let i = 1; i < ERAS.length; i++) {
      const prev = ERAS[i - 1];
      const cur = ERAS[i];
      expect(cur?.years[0]).toBeGreaterThanOrEqual(prev?.years[0] ?? 0);
      expect(cur?.years[1]).toBeGreaterThanOrEqual(prev?.years[1] ?? 0);
    }
  });

  it('has unique event ids, ordered dates and events inside the era years', () => {
    const seen = new Set<string>();
    for (const era of ERAS) {
      let last = -Infinity;
      for (const ev of era.events) {
        expect(seen.has(ev.id)).toBe(false);
        seen.add(ev.id);
        expect(ev.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(ev.year).toBeGreaterThanOrEqual(era.years[0]);
        expect(ev.year).toBeLessThanOrEqual(era.years[1]);
        const key = ev.year * 10000 + (ev.month ?? 0) * 100 + (ev.day ?? 0);
        expect(key).toBeGreaterThanOrEqual(last);
        last = key;
        if (ev.month !== undefined) expect(ev.month).toBeGreaterThanOrEqual(1);
        if (ev.month !== undefined) expect(ev.month).toBeLessThanOrEqual(12);
      }
    }
    expect(allEvents().length).toBe(seen.size);
  });

  it('gives every factual event a label and existing source IDs', () => {
    for (const ev of allEvents()) {
      expect(['documented', 'reconstructed', 'composite']).toContain(ev.label);
      expect(ev.sources.length).toBeGreaterThan(0);
      for (const id of ev.sources) expect(SOURCE_IDS.has(id), ev.id + ' cites unknown source ' + id).toBe(true);
    }
  });

  it('keeps later chapters as shells without factual claims', () => {
    for (const era of ERAS.slice(3)) {
      expect(era.shell).toBe(true);
      expect(era.events).toHaveLength(0);
    }
    for (const era of ERAS.slice(0, 3)) {
      expect(era.shell).toBe(false);
      expect(era.events.length).toBeGreaterThan(0);
    }
  });

  it('has Hebrew locale entries for every key it references', () => {
    const keys: string[] = ['timeline.title', 'timeline.hint.gamepad', 'timeline.hint.keyboard', 'timeline.hint.touch', 'timeline.hint.order', 'timeline.track', 'timeline.sources'];
    for (let m = 1; m <= 12; m++) keys.push('timeline.month.' + m);
    for (const l of ['documented', 'reconstructed', 'composite']) keys.push('timeline.label.' + l);
    for (const s of ['locked', 'unlocked', 'completed', 'soon', 'lockedMessage']) keys.push('timeline.status.' + s);
    for (const era of ERAS) {
      keys.push(era.titleKey, era.summaryKey);
      for (const ev of era.events) keys.push(ev.textKey);
    }
    for (const m of MARKERS) {
      keys.push(m.nameKey);
      for (const n of Object.values(m.notes ?? {})) keys.push(n.textKey);
    }
    for (const set of LENS_SETS) for (const l of set.lenses) keys.push(l.labelKey, l.bodyKey);
    for (const layer of LINE_LAYERS) keys.push(layer.labelKey);
    keys.push('timeline.lens.toggle', 'timeline.lens.none', 'timeline.layer.simplified', 'timeline.layer.pending');
    keys.push('timeline.map.title', 'timeline.map.places', 'timeline.map.reliefNote', 'timeline.map.back');
    const missing = keys.filter((k) => !Object.hasOwn(HEBREW, k));
    expect(missing).toEqual([]);
  });

  it('uses only timeline.* keys in its locale file and no placeholder text', () => {
    const own = Object.entries(HEBREW).filter(([k]) => k.startsWith('timeline.'));
    expect(own.length).toBeGreaterThan(60);
    for (const [k, v] of own) {
      expect(v.trim().length, k).toBeGreaterThan(0);
      expect(v, k).not.toMatch(/TODO|lorem|placeholder|XXX/i);
    }
  });

  it('chapter status follows progress and keeps shells locked', () => {
    expect(chapterStatus(0, new Set())).toBe('unlocked');
    expect(chapterStatus(1, new Set())).toBe('locked');
    expect(chapterStatus(1, new Set(['prologue']))).toBe('unlocked');
    expect(chapterStatus(0, new Set(['prologue']))).toBe('completed');
    expect(chapterStatus(2, new Set(['prologue']))).toBe('locked');
    expect(chapterStatus(3, new Set(['prologue', 'ch01', 'ch02']))).toBe('locked');
    expect(chapterStatus(99, new Set())).toBe('locked');
    expect(getEra('ch02').events.length).toBeGreaterThan(5);
  });
});

describe('event date formatting', () => {
  const i18n = createI18n('he', HEBREW);
  const t = i18n.t;
  const ev = (partial: Partial<KeyEvent> & Pick<KeyEvent, 'year'>): KeyEvent => ({ id: 'x', textKey: 'x', label: 'documented', sources: ['P-001'], ...partial });

  it('formats year, month, day and ranges in Hebrew', () => {
    expect(formatEventDate(ev({ year: 1882 }), t)).toBe('1882');
    expect(formatEventDate(ev({ year: 1939, month: 5 }), t)).toBe('מאי 1939');
    expect(formatEventDate(ev({ year: 1948, month: 5, day: 14 }), t)).toBe('14 במאי 1948');
    expect(formatEventDate(ev({ year: 1897, month: 8, day: 29, endMonth: 8, endDay: 31 }), t)).toBe('29–31 באוגוסט 1897');
    expect(formatYears([1947, 1949])).toBe('1947–1949');
    expect(formatYears([1967, 1967])).toBe('1967');
  });
});
