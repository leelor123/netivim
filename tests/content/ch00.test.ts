import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateChapter } from '../../src/content/validate';
import { validateCutscene } from '../../src/cinematics/validate';
import { CH00_CHAPTER, CH00_TWO_LENSES } from '../../src/content/ch00/chapter';
import { CH00_OPENING } from '../../src/content/ch00/cutscenes';
import { allDialogueKeys, FAILURES } from '../../src/content/ch00/dialogue';

const root = join(__dirname, '../..');
const localeDir = join(root, 'src/locales/he');

const localeKeys = new Set<string>();
for (const name of readdirSync(localeDir).filter((n) => n.endsWith('.json'))) {
  const dict = JSON.parse(readFileSync(join(localeDir, name), 'utf8')) as Record<string, string>;
  for (const key of Object.keys(dict)) localeKeys.add(key);
}

const sourceIds = new Set<string>();
for (const raw of readFileSync(join(root, 'SOURCES.md'), 'utf8').split('\n')) {
  const m = /^((?:P|C\d+)-\d{3}) \|/.exec(raw.trim());
  if (m?.[1]) sourceIds.add(m[1]);
}

const approvedIds = new Set(readFileSync(join(root, 'research/factcheck-ch00-ch01.md'), 'utf8').match(/\b(?:P|C1)-\d{3}\b/g) ?? []);

describe('prologue content', () => {
  it('passes validateChapter with zero problems', () => {
    expect(validateChapter(CH00_CHAPTER, { sourceIds, localeKeys, minMissions: 2 })).toEqual([]);
  });

  it('meets the delivery counts', () => {
    expect(CH00_CHAPTER.missions).toHaveLength(2);
    expect(CH00_CHAPTER.codex.length).toBeGreaterThanOrEqual(12);
    expect(CH00_CHAPTER.facts.length).toBeGreaterThanOrEqual(5);
    expect(CH00_CHAPTER.quiz.length).toBeGreaterThanOrEqual(5);
    expect(CH00_CHAPTER.quiz.length).toBeLessThanOrEqual(8);
    expect(CH00_CHAPTER.years).toEqual([1850, 1918]);
  });

  it('cites only sources from the fact-check approved lists in codex, archive, facts and quiz', () => {
    const unapproved: string[] = [];
    const groups = [CH00_CHAPTER.codex, CH00_CHAPTER.archive, CH00_CHAPTER.facts, CH00_CHAPTER.quiz];
    for (const items of groups) {
      for (const item of items) for (const s of item.sources) if (!approvedIds.has(s)) unapproved.push(item.id + ':' + s);
    }
    expect(unapproved).toEqual([]);
  });

  it('archive items use an allowed license and composite testimonies are labeled', () => {
    for (const a of CH00_CHAPTER.archive) expect(['public-domain', 'recreation', 'excerpt']).toContain(a.license);
    const composites = CH00_CHAPTER.testimonies.filter((t) => t.label === 'composite');
    expect(composites.length).toBeGreaterThan(0);
  });

  it('has every dialogue, hint, failure and lens locale key', () => {
    const missing = allDialogueKeys().filter((k) => !localeKeys.has(k));
    expect(missing).toEqual([]);
    for (const lens of CH00_TWO_LENSES) {
      for (const k of [lens.titleKey, lens.commonGroundKey, lens.limitsKey, lens.a.titleKey, lens.a.bodyKey, lens.b.titleKey, lens.b.bodyKey]) {
        expect(localeKeys.has(k), k).toBe(true);
      }
      for (const s of [...lens.commonSources, ...lens.a.sources, ...lens.b.sources]) expect(sourceIds.has(s), s).toBe(true);
    }
    for (const f of FAILURES) {
      for (const s of f.sources) expect(sourceIds.has(s), s).toBe(true);
      if (f.label === 'documented') expect(f.sources.length).toBeGreaterThan(0);
    }
  });
});

describe('prologue cutscene', () => {
  it('passes validateCutscene with zero problems', () => {
    const problems = validateCutscene(CH00_OPENING, {
      hasKey: (k) => localeKeys.has(k),
      isKnownSource: (id) => sourceIds.has(id),
    });
    expect(problems).toEqual([]);
  });

  it('runs 60 to 90 seconds', () => {
    expect(CH00_OPENING.durationSec).toBeGreaterThanOrEqual(60);
    expect(CH00_OPENING.durationSec).toBeLessThanOrEqual(90);
  });
});
