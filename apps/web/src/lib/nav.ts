import type { Key } from "../i18n/t";

// D-384: three sections; D-403: memory is the fourth (asked for in the side bar). Every other page still opens by its
// link, from the section it lives under (projects → rules; settings → accounts, system, tools, roles, local access);
// the side bar lights up that section.
export type Page = "tasks" | "overview" | "library" | "board" | "harness" | "new" | "task" | "login" | "keys" | "settings" | "agents" | "tools" | "night" | "research" | "system" | "memory";
export type Section = "tasks" | "projects" | "memory" | "settings";

export const NAV: readonly { id: Section; href: string; label: Key }[] = [
  { id: "tasks", href: "/", label: "nav.tasks" },
  { id: "projects", href: "/harness", label: "nav.projects" },
  { id: "memory", href: "/memory", label: "nav.memory" },
  { id: "settings", href: "/settings", label: "nav.settings" },
];

const UNDER: Record<Page, Section | null> = {
  tasks: "tasks", task: "tasks", new: "tasks", overview: "tasks", library: "tasks", board: "tasks", agents: "tasks", night: "tasks", research: "tasks",
  harness: "projects",
  memory: "memory",
  settings: "settings", keys: "settings", system: "settings", tools: "settings",
  login: null,
};

export function navActive(page: Page): Section | null {
  return UNDER[page];
}

/** D-386: one page per task — the tasks page with the task open (the old /tasks/:id redirects here). */
export function taskHref(id: string): string {
  return `/?task=${encodeURIComponent(id)}`;
}
