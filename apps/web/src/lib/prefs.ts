// D-305: per-person UI preferences, kept in cookies (read by the server, so there is no flash of the wrong theme).
export type Theme = "dark" | "light" | "system";
export type View = "map" | "columns" | "project" | "list";

export const THEMES: { id: Theme; label: string }[] = [
  { id: "dark", label: "Тъмна" },
  { id: "light", label: "Светла" },
  { id: "system", label: "Като системата" },
];
export const VIEWS: { id: View; label: string; hint: string }[] = [
  { id: "map", label: "Карта + проекти", hint: "потокът отгоре, плочка за всеки проект" },
  { id: "columns", label: "Карта + колони", hint: "колона за всеки проект" },
  { id: "project", label: "Проект", hint: "списък с проекти и всичко за избрания" },
  { id: "list", label: "Списък", hint: "всички задачи по състояние" },
];

export function parseTheme(v: string | undefined): Theme {
  return v === "light" || v === "system" || v === "dark" ? v : "dark";
}
export function parseView(v: string | undefined): View {
  return VIEWS.some((x) => x.id === v) ? (v as View) : "map";
}
/** D-307: samples fill the screens the system does not record yet; on unless switched off. */
/** The labelled sample (D-307): the cookie wins; without it, on in development and off in production (U4, D-332). */
export function parseSample(v: string | undefined, nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  if (v === "0") return false;
  if (v === "1") return true;
  return nodeEnv !== "production";
}
export function prefCookie(name: "theme" | "view" | "sample", value: string): string {
  return `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
