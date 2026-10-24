import { bg } from "./bg";
import { en } from "./en";
import type { Key } from "./en";

// E9g B (D-377): the site's catalog, the same style as apps/web/src/i18n (E7e, D-348): one catalog, no library.
// English pages live at /, Bulgarian at /bg/ (a static export has no server to read Accept-Language).
export type { Key } from "./en";
export type Lang = "en" | "bg";
export const LANGS: readonly Lang[] = ["en", "bg"];
const CATALOG: Record<Lang, Record<Key, string>> = { en, bg };

export type Params = Record<string, string | number>;

export function translate(lang: Lang, key: Key, params?: Params): string {
  const s = CATALOG[lang][key];
  return params ? s.replace(/\{(\w+)\}/g, (m, name: string) => (params[name] === undefined ? m : String(params[name]))) : s;
}

export type T = (key: Key, params?: Params) => string;
export function translator(lang: Lang): T {
  return (key, params) => translate(lang, key, params);
}

/** The site's pages, with the trailing slash of the export. */
export type PagePath = "/" | "/download/";

/** The address of a page in a language: English at the root, Bulgarian under /bg. */
export function pagePath(lang: Lang, page: PagePath): string {
  return lang === "en" ? page : `/bg${page}`;
}
