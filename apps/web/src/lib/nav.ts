import type { Key } from "../i18n/t";

// D-384: three sections; D-398 (E9d): research is the fourth, its own place next to tasks. Every other page still opens by its link, from the section it lives under (projects →
// rules; settings → accounts, system, tools, roles, local access); the side bar lights up that section.
export type Page = "tasks" | "overview" | "library" | "board" | "harness" | "new" | "task" | "login" | "keys" | "settings" | "agents" | "tools" | "night" | "research" | "system";
export type Section = "tasks" | "research" | "projects" | "settings";

export const NAV: readonly { id: Section; href: string; label: Key }[] = [
  { id: "tasks", href: "/", label: "nav.tasks" },
  { id: "research", href: "/research", label: "nav.research" },
  { id: "projects", href: "/harness", label: "nav.projects" },
  { id: "settings", href: "/settings", label: "nav.settings" },
];

const UNDER: Record<Page, Section | null> = {
  tasks: "tasks", task: "tasks", new: "tasks", overview: "tasks", library: "tasks", board: "tasks", agents: "tasks", night: "tasks", research: "research",
  harness: "projects",
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
