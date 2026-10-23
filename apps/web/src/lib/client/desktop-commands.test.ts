import { describe, expect, it } from "vitest";
import { commandAction, isTyping, runCommandAction } from "./desktop-commands";
import type { CommandDocument } from "./desktop-commands";

// E9g A2 (AC-12.5, AC-12.7): what the web does with a command from the desktop menu, a shortcut or a notification click.
// Pure mapping first, then the runner against a fake document.
describe("commandAction", () => {
  const idle = { typing: false };

  it("menu screens go to the real routes", () => {
    expect(commandAction({ command: "view", view: "inbox" }, idle)).toEqual({ kind: "navigate", href: "/" });
    expect(commandAction({ command: "view", view: "board" }, idle)).toEqual({ kind: "navigate", href: "/board" });
    expect(commandAction({ command: "view", view: "agents" }, idle)).toEqual({ kind: "navigate", href: "/agents" });
    expect(commandAction({ command: "view", view: "tools" }, idle)).toEqual({ kind: "navigate", href: "/tools" });
    expect(commandAction({ command: "view", view: "night" }, idle)).toEqual({ kind: "navigate", href: "/night" });
    expect(commandAction({ command: "view", view: "research" }, idle)).toEqual({ kind: "navigate", href: "/research" });
  });

  it("new task, a task card from a notification, add project", () => {
    expect(commandAction({ command: "new_task" }, idle)).toEqual({ kind: "navigate", href: "/tasks/new" });
    expect(commandAction({ command: "open_task", task_id: "t_ab_1" }, idle)).toEqual({ kind: "navigate", href: "/tasks/t_ab_1" });
    expect(commandAction({ command: "add_project" }, idle)).toEqual({ kind: "navigate", href: "/harness" });
  });

  it("approve only presses the page's own Approve button (its confirm + TOTP decide); never while typing", () => {
    expect(commandAction({ command: "approve" }, idle)).toEqual({ kind: "click", selector: "[data-desktop-approve]" });
    expect(commandAction({ command: "approve" }, { typing: true })).toEqual({ kind: "none" });
  });

  it("projects 1..9 press the n-th project in the side bar; search focuses a search field, else the board", () => {
    expect(commandAction({ command: "open_project", index: 3 }, idle)).toEqual({ kind: "click", selector: '[data-desktop-project="3"]' });
    expect(commandAction({ command: "search" }, idle)).toEqual({ kind: "focus", selector: "[data-desktop-search]", fallback: "/board" });
    expect(commandAction({ command: "apply_locally" }, idle)).toEqual({ kind: "click", selector: "[data-desktop-apply]" });
    expect(commandAction({ command: "shortcuts" }, idle)).toEqual({ kind: "none" });
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

  it("navigate pushes the route; click and focus act on the element", () => {
    const pushed: string[] = [];
    const els = { "[data-desktop-approve]": {}, "[data-desktop-search]": {} };
    const doc = fakeDoc(els);
    runCommandAction({ kind: "navigate", href: "/board" }, doc, (h) => pushed.push(h));
    runCommandAction({ kind: "click", selector: "[data-desktop-approve]" }, doc, (h) => pushed.push(h));
    runCommandAction({ kind: "focus", selector: "[data-desktop-search]", fallback: "/board" }, doc, (h) => pushed.push(h));
    expect(pushed).toEqual(["/board"]);
    expect(els["[data-desktop-approve]"]).toEqual({ clicked: true });
    expect(els["[data-desktop-search]"]).toEqual({ focused: true });
  });

  it("no element: a click does nothing, a focus falls back to its route; a disabled button is not pressed", () => {
    const pushed: string[] = [];
    const els = { "[data-desktop-approve]": { disabled: true } };
    runCommandAction({ kind: "click", selector: "[data-desktop-apply]" }, fakeDoc(els), (h) => pushed.push(h));
    runCommandAction({ kind: "click", selector: "[data-desktop-approve]" }, fakeDoc(els), (h) => pushed.push(h));
    runCommandAction({ kind: "focus", selector: "[data-desktop-search]", fallback: "/board" }, fakeDoc(els), (h) => pushed.push(h));
    runCommandAction({ kind: "none" }, fakeDoc(els), (h) => pushed.push(h));
    expect(pushed).toEqual(["/board"]);
    expect(els["[data-desktop-approve]"]).toEqual({ disabled: true });
  });
});
