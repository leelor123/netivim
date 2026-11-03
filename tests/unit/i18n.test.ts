import { describe, expect, it } from 'vitest';
import { createI18n } from '../../src/core/i18n';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mergeLocales } from '../../src/locales';

const dir = join(__dirname, '../../src/locales/he');
const files = Object.fromEntries(
  readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .map((n) => [n, JSON.parse(readFileSync(join(dir, n), 'utf8')) as Record<string, string>]),
);

describe('i18n', () => {
  const i18n = createI18n('he', { greet: 'שלום {name}', plain: 'טקסט' });

  it('marks Hebrew as right-to-left', () => {
    expect(i18n.dir).toBe('rtl');
    expect(createI18n('en', {}).dir).toBe('ltr');
  });

  it('fills placeholders and leaves unknown ones intact', () => {
    expect(i18n.t('greet', { name: 'דנה' })).toBe('שלום דנה');
    expect(i18n.t('greet')).toBe('שלום {name}');
    expect(i18n.t('greet', { other: 1 })).toBe('שלום {name}');
  });

  it('returns the key itself for a missing string', () => {
    expect(i18n.t('missing.key')).toBe('missing.key');
    expect(i18n.has('missing.key')).toBe(false);
  });

  it('does not resolve inherited object properties as keys', () => {
    expect(i18n.t('toString')).toBe('toString');
  });
});

describe('Hebrew locale files', () => {
  it('merge without duplicate keys', () => {
    expect(() => mergeLocales(files)).not.toThrow();
    expect(() => mergeLocales({ a: { k: 'x' }, b: { k: 'y' } })).toThrow(/Duplicate locale key k/);
  });

  it('use only safe bidi isolates (U+2066-U+2069), never embedding or override controls', () => {
    // Isolates keep English phrases readable inside Hebrew. Embeddings/overrides (U+202A-U+202E)
    // can disguise text ("Trojan Source") and are never needed here.
    const unsafe = /[\u202A-\u202E]/;
    for (const [key, value] of Object.entries(mergeLocales(files))) expect(unsafe.test(value), key).toBe(false);
  });

  it('have only non-empty string values', () => {
    for (const [key, value] of Object.entries(mergeLocales(files))) {
      expect(typeof value, key).toBe('string');
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });
});
