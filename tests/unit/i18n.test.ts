import { describe, expect, it } from 'vitest';
import { createI18n } from '../../src/core/i18n';
import he from '../../src/locales/he.json';

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

describe('Hebrew locale file', () => {
  it('has only non-empty string values', () => {
    for (const [key, value] of Object.entries(he)) {
      expect(typeof value, key).toBe('string');
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });
});
