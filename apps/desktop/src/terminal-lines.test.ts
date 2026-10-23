import { describe, expect, it } from "vitest";
import { LineTracker } from "./terminal-lines.js";

// E9g A4 (AC-12.8, D-375): the lines the person types into the host terminal, for task_activities. It follows the
// keystrokes, not the shell: printable text, backspace, Ctrl+U/Ctrl+C clear the line, escape sequences (arrows, history)
// are dropped. Tab completion and history recall are invisible to it (the shell keeps them) — the trail is approximate.
describe("LineTracker", () => {
  it("one line per Enter (CR or LF), trimmed; empty lines give nothing", () => {
    const t = new LineTracker();
    expect(t.feed("ls -la")).toEqual([]);
    expect(t.feed("\r")).toEqual(["ls -la"]);
    expect(t.feed("  pnpm test  \rgit status\n\r\r")).toEqual(["pnpm test", "git status"]);
  });

  it("backspace (DEL and BS) removes the last character, never more than the line", () => {
    const t = new LineTracker();
    expect(t.feed("lss\x7f -l\b\bl\r")).toEqual(["ls l"]);
    expect(t.feed("\x7f\x7fa\r")).toEqual(["a"]);
  });

  it("Ctrl+C and Ctrl+U drop the line; Ctrl+D on an empty line is nothing", () => {
    const t = new LineTracker();
    expect(t.feed("rm -rf x\x03")).toEqual([]);
    expect(t.feed("echo\x15date\r")).toEqual(["date"]);
    expect(t.feed("\x04")).toEqual([]);
  });

  it("escape sequences (arrows, bracketed paste markers, OSC) are dropped; pasted text counts", () => {
    const t = new LineTracker();
    expect(t.feed("\x1b[Agit log\x1b[D\x1b[C\r")).toEqual(["git log"]);
    expect(t.feed("\x1b[200~npm ci\x1b[201~\r")).toEqual(["npm ci"]);
    expect(t.feed("\x1b]0;title\x07pwd\r")).toEqual(["pwd"]);
    expect(t.feed("\x1bOAuname\r")).toEqual(["uname"]);
  });

  it("an escape sequence split across two writes is still dropped", () => {
    const t = new LineTracker();
    expect(t.feed("ab\x1b")).toEqual([]);
    expect(t.feed("[Dc\r")).toEqual(["abc"]);
  });

  it("a line is capped at 2000 characters; other control characters are ignored", () => {
    const t = new LineTracker();
    expect(t.feed(`${"x".repeat(2500)}\r`)).toEqual(["x".repeat(2000)]);
    expect(t.feed("a\tb\x01c\r")).toEqual(["abc"]);
  });
});
