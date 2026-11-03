import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LensState, LENS_SETS, lensSetFor } from '../../src/features/livingMap/lenses';
import { MARKERS } from '../../src/features/livingMap/markers';

function registerIds(): Set<string> {
  const ids = new Set<string>();
  for (const n of ['00', '01', '02']) {
    const text = readFileSync(join(__dirname, '../../research/sources-ch' + n + '.md'), 'utf8');
    for (const m of text.matchAll(/^`?((?:P|C1|C2)-\d{3})`?\s*\|/gm)) ids.add(m[1] as string);
  }
  return ids;
}

describe('lens state', () => {
  it('starts on the first lens and cycles through the set', () => {
    const s = new LensState();
    expect(s.hasLenses('ch02')).toBe(true);
    expect(s.hasLenses('ch01')).toBe(false);
    expect(s.active('ch02')?.id).toBe('independence');
    expect(s.toggle('ch02')?.id).toBe('nakba');
    expect(s.active('ch02')?.id).toBe('nakba');
    expect(s.toggle('ch02')?.id).toBe('independence');
    expect(s.cycle('ch02', -1)?.id).toBe('nakba');
  });

  it('does nothing for eras without lenses', () => {
    const s = new LensState();
    expect(s.active('ch01')).toBeNull();
    expect(s.toggle('ch01')).toBeNull();
    expect(s.set('ch01', 'nakba')).toBe(false);
  });

  it('sets a lens directly and notifies once per real change', () => {
    const s = new LensState();
    const seen: string[] = [];
    const off = s.onChange((era, lens) => seen.push(era + ':' + (lens?.id ?? 'none')));
    expect(s.set('ch02', 'independence')).toBe(true);
    expect(seen).toEqual([]);
    expect(s.set('ch02', 'nakba')).toBe(true);
    expect(seen).toEqual(['ch02:nakba']);
    off();
    s.toggle('ch02');
    expect(seen).toHaveLength(1);
  });

  it('keeps the choice per era', () => {
    const custom = new LensState([...LENS_SETS, { eraId: 'ch01', lenses: lensSetFor('ch02')?.lenses ?? LENS_SETS[0]?.lenses ?? [] }]);
    custom.set('ch02', 'nakba');
    expect(custom.active('ch01')?.id).toBe('independence');
    expect(custom.active('ch02')?.id).toBe('nakba');
  });
});

describe('lens content', () => {
  const ids = registerIds();

  it('labels and sources every lens and every per-place caption', () => {
    const set = lensSetFor('ch02');
    expect(set?.lenses.map((l) => l.id)).toEqual(['independence', 'nakba']);
    for (const s of LENS_SETS) {
      for (const l of s.lenses) {
        expect(l.sources.length).toBeGreaterThan(0);
        for (const id of l.sources) expect(ids.has(id), id).toBe(true);
      }
    }
    for (const m of MARKERS) {
      for (const id of m.sources) expect(ids.has(id), m.id + ' ' + id).toBe(true);
      for (const n of Object.values(m.notes ?? {})) {
        expect(n.sources.length).toBeGreaterThan(0);
        for (const id of n.sources) expect(ids.has(id), id).toBe(true);
      }
    }
  });

  it('gives both narratives a caption where the research supports both', () => {
    const both = MARKERS.filter((m) => m.notes?.independence && m.notes.nakba).map((m) => m.id);
    expect(both).toEqual(expect.arrayContaining(['tel-aviv', 'lod-ramle', 'deir-yassin']));
  });
});
