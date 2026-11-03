export type Dictionary = Readonly<Record<string, string>>;
export type Params = Readonly<Record<string, string | number>>;

export interface I18n {
  readonly locale: string;
  readonly dir: 'rtl' | 'ltr';
  t(key: string, params?: Params): string;
  has(key: string): boolean;
}

const RTL_LOCALES = new Set(['he', 'ar']);

/** Creates a translator over a flat key -> string dictionary with {name} placeholders. */
export function createI18n(locale: string, dict: Dictionary): I18n {
  return {
    locale,
    dir: RTL_LOCALES.has(locale) ? 'rtl' : 'ltr',
    has: (key) => Object.hasOwn(dict, key),
    t(key, params) {
      const template = Object.hasOwn(dict, key) ? dict[key] : undefined;
      // A missing key renders as the key itself so it is visible in QA, never as "undefined".
      if (template === undefined) return key;
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        Object.hasOwn(params, name) ? String(params[name]) : match,
      );
    },
  };
}
