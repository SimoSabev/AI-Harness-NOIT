import { describe, expect, it } from "vitest";
import { commandAction, isTyping, runCommandAction } from "./desktop-commands";
import type { CommandDocument } from "./desktop-commands";

// E9g A2 (AC-12.5, AC-12.7): what the web does with a command from the desktop menu, a shortcut or a notification click.
// Pure mapping first, then the runner against a fake document.
describe("commandAction", () => {
  const idle = { typing: false };

  it("the View menu's four sections go to the side bar's routes (D-384, D-403)", () => {
    expect(commandAction({ command: "view", view: "tasks" }, idle)).toEqual({ kind: "navigate", href: "/" });
    expect(commandAction({ command: "view", view: "projects" }, idle)).toEqual({ kind: "navigate", href: "/harness" });
    expect(commandAction({ command: "view", view: "memory" }, idle)).toEqual({ kind: "navigate", href: "/memory" });
    expect(commandAction({ command: "view", view: "settings" }, idle)).toEqual({ kind: "navigate", href: "/settings" });
  });

  it("new task, a task card from a notification, add project", () => {
    expect(commandAction({ command: "new_task" }, idle)).toEqual({ kind: "navigate", href: "/" });
    expect(commandAction({ command: "open_task", task_id: "t_ab_1" }, idle)).toEqual({ kind: "navigate", href: "/?task=t_ab_1" });
    expect(commandAction({ command: "add_project" }, idle)).toEqual({ kind: "navigate", href: "/projects/add" });
    // E9g A3 (AC-12.6): a dropped folder / "Open with" → the Add project screen with the suggestion
    expect(commandAction({ command: "add_project", path: "/Users/simo/shop" }, idle)).toEqual({ kind: "navigate", href: "/projects/add?path=%2FUsers%2Fsimo%2Fshop" });
  });

  it("approve only presses the page's own Approve button (its confirm + TOTP decide); never while typing", () => {
    expect(commandAction({ command: "approve" }, idle)).toEqual({ kind: "click", selector: "[data-desktop-approve]" });
    expect(commandAction({ command: "approve" }, { typing: true })).toEqual({ kind: "none" });
  });

  it("apply locally presses the page's own button", () => {
    expect(commandAction({ command: "apply_locally" }, idle)).toEqual({ kind: "click", selector: "[data-desktop-apply]" });
  });

  it("the host terminal's events are for its panel only: no navigation, no click (E9g A4)", () => {
    const id = "term_0123456789abcdef";
    for (const c of [{ command: "terminal_output", id, data: "x" }, { command: "terminal_exit", id, code: 0 }, { command: "terminal_line", id, task_id: "t_1", line: "ls" }] as const)
      expect(commandAction(c, idle)).toEqual({ kind: "none" });
  });
});

describe("isTyping", () => {
  it("text fields and editable elements count; buttons and the page do not", () => {
    expect(isTyping({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTyping({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(isTyping({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(isTyping({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTyping({ tagName: "BUTTON" })).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});

describe("runCommandAction", () => {
  function fakeDoc(elements: Record<string, { clicked?: boolean; focused?: boolean; disabled?: boolean }>): CommandDocument {
    return {
      querySelector: (sel: string) => {
        const e = elements[sel];
        if (!e) return null;
        return { click: () => void (e.clicked = true), focus: () => void (e.focused = true), ...(e.disabled ? { disabled: true } : {}) };
      },
    };
  }

  it("navigate pushes the route; click presses the element", () => {
    const pushed: string[] = [];
    const els = { "[data-desktop-approve]": {} };
    const doc = fakeDoc(els);
    runCommandAction({ kind: "navigate", href: "/settings" }, doc, (h) => pushed.push(h));
    runCommandAction({ kind: "click", selector: "[data-desktop-approve]" }, doc, (h) => pushed.push(h));
    expect(pushed).toEqual(["/settings"]);
    expect(els["[data-desktop-approve]"]).toEqual({ clicked: true });
  });

  it("no element: a click does nothing; a disabled button is not pressed", () => {
    const pushed: string[] = [];
    const els = { "[data-desktop-approve]": { disabled: true } };
    runCommandAction({ kind: "click", selector: "[data-desktop-apply]" }, fakeDoc(els), (h) => pushed.push(h));
    runCommandAction({ kind: "click", selector: "[data-desktop-approve]" }, fakeDoc(els), (h) => pushed.push(h));
    runCommandAction({ kind: "none" }, fakeDoc(els), (h) => pushed.push(h));
    expect(pushed).toEqual([]);
    expect(els["[data-desktop-approve]"]).toEqual({ disabled: true });
  });
});
