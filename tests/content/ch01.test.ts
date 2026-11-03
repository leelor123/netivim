import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CH01 } from '../../src/content/ch01/chapter';
import { CH01_CUTSCENES } from '../../src/content/ch01/cutscenes';
import { dialogueKeys, MISSION_SCRIPTS, TWO_LENSES } from '../../src/content/ch01/dialogue';
import { validateChapter } from '../../src/content/validate';
import { validateCutscene } from '../../src/cinematics/validate';

const root = join(__dirname, '../..');
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

/** IDs from SOURCES.md. */
function sourceIds(): Set<string> {
  const ids = new Set<string>();
  for (const m of read('SOURCES.md').matchAll(/^((?:P|C1|C2)-\d{3}) \|/gm)) ids.add(m[1] as string);
  return ids;
}

/** Locale keys from every src/locales/he/*.json. */
function localeKeys(): Set<string> {
  const dir = join(root, 'src/locales/he');
  const keys = new Set<string>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    for (const k of Object.keys(JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record<string, string>)) keys.add(k);
  }
  return keys;
}

/**
 * Approved/opened IDs: either listed in the fact-check (and marked opened in SOURCES.md), or an
 * opened (YES) entry in the perspectives register.
 */
function approvedIds(): Set<string> {
  const ok = new Set<string>();
  const factcheck = read('research/factcheck-ch00-ch01.md');
  for (const m of read('SOURCES.md').matchAll(/^((?:P|C1)-\d{3}) \|.*\| (YES-FC)\s*$/gm)) {
    const id = m[1] as string;
    if (factcheck.includes(id)) ok.add(id);
  }
  for (const m of read('research/perspectives-ch00-ch01.md').matchAll(/^((?:P|C1)-1\d{2}) \|.*\| (YES)\b[^|]*$/gm)) ok.add(m[1] as string);
  return ok;
}

const SOURCE_IDS = sourceIds();
const LOCALE = localeKeys();
const APPROVED = approvedIds();

describe('chapter 1 content', () => {
  it('parses the registers (sanity)', () => {
    expect(SOURCE_IDS.has('C1-001')).toBe(true);
    expect(APPROVED.has('C1-060')).toBe(true);
    expect(APPROVED.has('C1-101')).toBe(true);
    expect(APPROVED.has('C1-112')).toBe(false);
  });

  it('passes validateChapter with zero problems', () => {
    expect(validateChapter(CH01, { sourceIds: SOURCE_IDS, localeKeys: LOCALE })).toEqual([]);
  });

  it('meets the delivery counts', () => {
    expect(CH01.missions.map((m) => m.gameplayType)).toEqual(['PZL', 'STL', 'DEC']);
    expect(CH01.codex.length).toBeGreaterThanOrEqual(17);
    expect(CH01.facts.length).toBeGreaterThanOrEqual(6);
    expect(CH01.quiz.length).toBeGreaterThanOrEqual(8);
    expect(CH01.quiz.length).toBeLessThanOrEqual(10);
    expect(CH01.contentNote).toBe(true);
  });

  it('cites only approved, opened sources in quiz, facts, codex, archive and testimonies', () => {
    const bad: string[] = [];
    const all = [...CH01.quiz, ...CH01.facts, ...CH01.codex, ...CH01.archive, ...CH01.testimonies];
    for (const it of all) for (const s of it.sources) if (!APPROVED.has(s)) bad.push(it.id + ':' + s);
    expect(bad).toEqual([]);
  });

  it('never uses the Peel scan and labels recreations correctly', () => {
    const peel = CH01.archive.find((a) => a.id === 'peel');
    expect(peel?.license).toBe('recreation');
    for (const id of ['balfour', 'mandate', 'white-paper']) expect(CH01.archive.find((a) => a.id === id)?.license).toBe('public-domain');
    expect(CH01.archive.find((a) => a.id === 'res181')?.license).toBe('excerpt');
  });

  it('has every dialogue, hint, failure and Two Lenses key in the locale', () => {
    const missing = dialogueKeys().filter((k) => !LOCALE.has(k));
    expect(missing).toEqual([]);
  });

  it('dialogue and lenses cite approved sources, and every mission has failures with sources', () => {
    const bad: string[] = [];
    for (const m of MISSION_SCRIPTS) {
      expect(m.failures.length).toBeGreaterThanOrEqual(3);
      for (const l of [...m.briefing, ...m.debrief]) for (const s of l.sources) if (!APPROVED.has(s)) bad.push(m.missionId + ':' + s);
      for (const f of m.failures) {
        if (f.sources.length === 0) bad.push(m.missionId + ':' + f.id + ':nosource');
        for (const s of f.sources) if (!APPROVED.has(s)) bad.push(m.missionId + ':' + f.id + ':' + s);
      }
    }
    for (const t of TWO_LENSES) for (const s of t.sources) if (!APPROVED.has(s)) bad.push(t.id + ':' + s);
    expect(bad).toEqual([]);
    expect(MISSION_SCRIPTS.map((m) => m.missionId)).toEqual(CH01.missions.map((m) => m.id));
    expect(TWO_LENSES.map((t) => t.id)).toEqual(expect.arrayContaining(['1929', 'revolt', 'land', 'partition']));
  });

  it('locale values are non-empty and use no ASCII double quotes', () => {
    const json = JSON.parse(read('src/locales/he/ch01.json')) as Record<string, string>;
    for (const [k, v] of Object.entries(json)) {
      expect(k.startsWith('ch01.')).toBe(true);
      expect(v.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('chapter 1 cutscenes', () => {
  it('pass validateCutscene with zero problems and run 60-120 s', () => {
    expect(CH01_CUTSCENES.length).toBeGreaterThanOrEqual(1);
    for (const c of CH01_CUTSCENES) {
      expect(c.durationSec).toBeGreaterThanOrEqual(60);
      expect(c.durationSec).toBeLessThanOrEqual(120);
      const problems = validateCutscene(c, { hasKey: (k) => LOCALE.has(k), isKnownSource: (s) => SOURCE_IDS.has(s) });
      expect(problems).toEqual([]);
      for (const s of c.sources) expect(APPROVED.has(s)).toBe(true);
    }
  });
});
