import type { Key } from "../i18n/t";

// D-384: three sections. Every other page still opens by its link, from the section it lives under (projects →
// rules; settings → accounts, system, tools, roles, local access); the side bar lights up that section.
export type Page = "tasks" | "overview" | "library" | "board" | "harness" | "new" | "task" | "login" | "keys" | "settings" | "agents" | "tools" | "night" | "research" | "system";
export type Section = "tasks" | "projects" | "settings";

export const NAV: readonly { id: Section; href: string; label: Key }[] = [
  { id: "tasks", href: "/", label: "nav.tasks" },
  { id: "projects", href: "/harness", label: "nav.projects" },
  { id: "settings", href: "/settings", label: "nav.settings" },
];

const UNDER: Record<Page, Section | null> = {
  tasks: "tasks", task: "tasks", new: "tasks", overview: "tasks", library: "tasks", board: "tasks", agents: "tasks", night: "tasks", research: "tasks",
  harness: "projects",
  settings: "settings", keys: "settings", system: "settings", tools: "settings",
  login: null,
};

export function navActive(page: Page): Section | null {
  return UNDER[page];
}
