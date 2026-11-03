import type { Dictionary } from '../core/i18n';

/**
 * Each system owns its own locale file (src/locales/he/<area>.json) so parallel work never
 * edits the same file. Keys must be unique across files; a duplicate is a build-time error.
 */
export function mergeLocales(files: Readonly<Record<string, Dictionary>>): Dictionary {
  const out: Record<string, string> = {};
  const owner: Record<string, string> = {};
  for (const [file, dict] of Object.entries(files)) {
    for (const [key, value] of Object.entries(dict)) {
      if (Object.hasOwn(out, key)) throw new Error('Duplicate locale key ' + key + ' in ' + file + ' and ' + String(owner[key]));
      out[key] = value;
      owner[key] = file;
    }
  }
  return out;
}

const hebrewFiles = import.meta.glob<Dictionary>('./he/*.json', { eager: true, import: 'default' });

export const HEBREW: Dictionary = mergeLocales(hebrewFiles);
