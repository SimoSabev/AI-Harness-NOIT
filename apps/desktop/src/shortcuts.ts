import type { DesktopCommand } from "@mandat/contract";
import { dt } from "./i18n.js";
import type { DesktopKey, Lang } from "./i18n.js";

// E9g A2 (AC-12.7): the keyboard map of the desktop window, pure. The "Keys" menu registers these accelerators (each
// exactly once in the whole menu), Help → Keyboard shortcuts prints them, and main registers the one global entry.
// Approve sends the approve command to the web; the web opens its own confirm (with the TOTP code when the change asks
// for one) and decides. Main never approves anything.

/** Electron accelerator syntax (https://www.electronjs.org/docs/latest/api/accelerator, see D-372). */
export const QUICK_ENTRY = "CommandOrControl+Shift+Space";

export interface Shortcut {
  id: string;
  accelerator: string;
  command: DesktopCommand;
  label: DesktopKey;
  params?: Record<string, number>;
  /** true only for the system-wide quick entry (globalShortcut); the rest work while the window has focus */
  global: boolean;
}

export function shortcutMap(): readonly Shortcut[] {
  const projects: Shortcut[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
    id: `project_${n}`,
    accelerator: `CommandOrControl+${n}`,
    command: { command: "open_project", index: n },
    label: "cmd.project",
    params: { n },
    global: false,
  }));
  return [
    { id: "new_task", accelerator: "CommandOrControl+N", command: { command: "new_task" }, label: "cmd.newTask", global: false },
    { id: "approve", accelerator: "CommandOrControl+Enter", command: { command: "approve" }, label: "cmd.approve", global: false },
    { id: "search", accelerator: "CommandOrControl+K", command: { command: "search" }, label: "cmd.search", global: false },
    ...projects,
    { id: "quick_entry", accelerator: QUICK_ENTRY, command: { command: "new_task" }, label: "cmd.quickEntry", global: true },
  ];
}

const MAC: Record<string, string> = { CommandOrControl: "⌘", Shift: "⇧", Alt: "⌥", Enter: "↩" };
const MAC_ORDER = ["Control", "Alt", "Shift", "CommandOrControl"];

/** How a shortcut is written for people: ⇧⌘Space on macOS, Ctrl+Shift+Space elsewhere. */
export function acceleratorLabel(accelerator: string, platform: string): string {
  const parts = accelerator.split("+");
  if (platform !== "darwin") return parts.map((p) => (p === "CommandOrControl" ? "Ctrl" : p)).join("+");
  const key = parts[parts.length - 1] ?? "";
  const mods = parts.slice(0, -1).sort((a, b) => MAC_ORDER.indexOf(a) - MAC_ORDER.indexOf(b));
  return [...mods, key].map((p) => MAC[p] ?? p).join("");
}

export function shortcutLabel(s: Shortcut, lang: Lang): string {
  return dt(lang, s.label, s.params);
}

/** Help → Keyboard shortcuts: one line per shortcut. */
export function shortcutsText(lang: Lang, platform: string): string {
  return shortcutMap()
    .map((s) => `${acceleratorLabel(s.accelerator, platform)}  ${shortcutLabel(s, lang)}`)
    .join("\n");
}
