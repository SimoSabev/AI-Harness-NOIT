import type { DesktopCommand, DesktopView } from "@mandat/contract";
import { addProjectHref } from "./local-access";

// E9g A2 (AC-12.5, AC-12.7): what the web does with a command from the desktop app (menu, keyboard shortcut, a click on
// a system notification). Only in the desktop window; in a browser there is no bridge and none of this runs.
// Approve never decides anything here: it presses the page's own Approve button, whose confirm step (with the TOTP code
// when the change asks for one) decides. While the person is typing it does nothing, so ⌘/Ctrl+Enter in a text box keeps
// doing what that box does (e.g. sending a new task).

export type CommandAction =
  | { kind: "navigate"; href: string }
  | { kind: "click"; selector: string }
  | { kind: "focus"; selector: string; fallback: string }
  | { kind: "none" };

const VIEW_HREF: Record<DesktopView, string> = { inbox: "/", board: "/board", agents: "/agents", tools: "/tools", night: "/night", research: "/research" };

export function commandAction(cmd: DesktopCommand, ctx: { typing: boolean }): CommandAction {
  switch (cmd.command) {
    case "new_task":
      return { kind: "navigate", href: "/tasks/new" };
    case "view":
      return { kind: "navigate", href: VIEW_HREF[cmd.view] };
    case "open_task":
      return { kind: "navigate", href: `/tasks/${encodeURIComponent(cmd.task_id)}` };
    case "add_project":
      return { kind: "navigate", href: addProjectHref(cmd.path) };
    case "approve":
      return ctx.typing ? { kind: "none" } : { kind: "click", selector: "[data-desktop-approve]" };
    case "open_project":
      return { kind: "click", selector: `[data-desktop-project="${cmd.index}"]` };
    case "search":
      return { kind: "focus", selector: "[data-desktop-search]", fallback: "/board" };
    case "apply_locally":
      return { kind: "click", selector: "[data-desktop-apply]" };
    case "shortcuts":
      return { kind: "none" };
    // E9g A4: the host terminal's events go to its panel (host-terminal.tsx), not to the page
    case "terminal_output":
    case "terminal_exit":
    case "terminal_line":
      return { kind: "none" };
  }
}

/** The part of document.activeElement the check needs. */
export interface FocusedLike {
  tagName: string;
  type?: string;
  isContentEditable?: boolean;
}

const NOT_TEXT = new Set(["button", "checkbox", "radio", "submit", "reset", "file", "image", "range", "color"]);

export function isTyping(el: FocusedLike | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return el.tagName === "INPUT" && !NOT_TEXT.has((el.type ?? "text").toLowerCase());
}

export interface CommandDocument {
  querySelector(selector: string): { click(): void; focus(): void; disabled?: boolean } | null;
}

export function runCommandAction(a: CommandAction, doc: CommandDocument, push: (href: string) => void): void {
  if (a.kind === "navigate") push(a.href);
  else if (a.kind === "click") {
    const el = doc.querySelector(a.selector);
    if (el && el.disabled !== true) el.click();
  } else if (a.kind === "focus") {
    const el = doc.querySelector(a.selector);
    if (el) el.focus();
    else push(a.fallback);
  }
}
