import { bg } from "./bg";
import { en } from "./en";
import type { Key } from "./en";

// E7f (D-348): one catalog, no library. Pure, so the same code runs on the server and in the browser.
export type { Key } from "./en";
export type Lang = "en" | "bg";
export const LANGS: readonly Lang[] = ["en", "bg"];
export const DEFAULT_LANG: Lang = "en";
/** The locale for Intl (dates, numbers, relative time, plural rules). en-GB: 24-hour clock, like the design. */
export const LOCALE: Record<Lang, string> = { en: "en-GB", bg: "bg-BG" };
const CATALOG: Record<Lang, Record<Key, string>> = { en, bg };

export type Params = Record<string, string | number>;
/** The base of a plural pair `<base>.one` / `<base>.other`. */
export type PluralBase = { [K in Key]: K extends `${infer B}.one` ? (`${B}.other` extends Key ? B : never) : never }[Key];

export function isLang(v: unknown): v is Lang {
  return v === "en" || v === "bg";
}

/** The cookie `lang` wins; then the first supported language of Accept-Language (by q); then English. */
export function parseLang(cookie: string | undefined, acceptLanguage: string | null | undefined): Lang {
  if (isLang(cookie)) return cookie;
  const prefs = (acceptLanguage ?? "")
    .split(",")
    .map((part, i) => {
      const [tag = "", ...rest] = part.trim().split(";");
      const q = rest.map((r) => /^\s*q=([0-9.]+)\s*$/.exec(r)?.[1]).find((x) => x !== undefined);
      return { lang: tag.trim().toLowerCase().split("-")[0] ?? "", q: q === undefined ? 1 : Number(q), i };
    })
    .filter((p) => p.q > 0 && isLang(p.lang))
    .sort((a, b) => b.q - a.q || a.i - b.i);
  const first = prefs[0]?.lang;
  return isLang(first) ? first : DEFAULT_LANG;
}

/** The string for `key` in `lang`; `{name}` is replaced by params[name]; a missing param stays visible. */
export function translate(lang: Lang, key: Key, params?: Params): string {
  const s = CATALOG[lang][key];
  return params ? s.replace(/\{(\w+)\}/g, (m, name: string) => (params[name] === undefined ? m : String(params[name]))) : s;
}

/** `<base>.one` or `<base>.other` by Intl.PluralRules; `{n}` is the count. */
export function plural(lang: Lang, base: PluralBase, n: number, params?: Params): string {
  const form = new Intl.PluralRules(LOCALE[lang]).select(n) === "one" ? "one" : "other";
  return translate(lang, `${base}.${form}` as Key, { n: formatNumber(lang, n), ...params });
}

export function formatNumber(lang: Lang, n: number, digits?: number): string {
  return new Intl.NumberFormat(LOCALE[lang], digits === undefined ? {} : { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

/** Dollars with two decimals in the number style of the language ($1,234.50 / $1 234,50). */
export function formatUsd(lang: Lang, n: number): string {
  return `$${formatNumber(lang, n, 2)}`;
}

export interface T {
  (key: Key, params?: Params): string;
  lang: Lang;
  locale: string;
  n: (base: PluralBase, n: number, params?: Params) => string;
  num: (n: number, digits?: number) => string;
  usd: (n: number) => string;
}

/** `t(key, params)` bound to one language — what pages and components use. */
export function translator(lang: Lang): T {
  const t = ((key: Key, params?: Params) => translate(lang, key, params)) as T;
  t.lang = lang;
  t.locale = LOCALE[lang];
  t.n = (base, n, params) => plural(lang, base, n, params);
  t.num = (n, digits) => formatNumber(lang, n, digits);
  t.usd = (n) => formatUsd(lang, n);
  return t;
}
