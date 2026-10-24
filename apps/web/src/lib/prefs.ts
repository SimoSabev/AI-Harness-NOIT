import type { Key, Lang } from "../i18n/t";

// D-305: per-person UI preferences, kept in cookies (read by the server, so there is no flash of the wrong theme).
export type Theme = "dark" | "light" | "system";
export type View = "map" | "columns" | "project" | "list";

// labels are catalog keys (E7f); the components translate them
export const THEMES: { id: Theme; label: Key }[] = [
  { id: "dark", label: "theme.dark" },
  { id: "light", label: "theme.light" },
  { id: "system", label: "theme.system" },
];
export const VIEWS: { id: View; label: Key; hint: Key }[] = [
  { id: "map", label: "view.map", hint: "view.map.hint" },
  { id: "columns", label: "view.columns", hint: "view.columns.hint" },
  { id: "project", label: "view.project", hint: "view.project.hint" },
  { id: "list", label: "view.list", hint: "view.list.hint" },
];
/** E7f: the language switch; each language is named in itself (English, Bulgarian), so anyone can find theirs. */
export const LANG_CHOICES: { id: Lang; label: Key }[] = [
  { id: "en", label: "lang.name.en" },
  { id: "bg", label: "lang.name.bg" },
];

export function parseTheme(v: string | undefined): Theme {
  return v === "light" || v === "system" || v === "dark" ? v : "dark";
}
export function parseView(v: string | undefined): View {
  return VIEWS.some((x) => x.id === v) ? (v as View) : "map";
}
export function prefCookie(name: "theme" | "view" | "lang", value: string): string {
  return `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
