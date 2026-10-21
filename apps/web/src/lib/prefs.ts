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
export function prefCookie(name: "theme" | "view", value: string): string {
  return `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
