import { describe, expect, it } from "vitest";
import { terminalActivity, terminalEvent, terminalFolders } from "./host-terminal";

// E9g A4 (AC-12.8, D-375): the web half of the host terminal. Main runs the shell; the panel shows its output, says it is
// not the sandbox, and writes each typed line to task_activities (the server redacts secrets).
const id = "term_0123456789abcdef";

describe("host terminal helpers", () => {
  it("only the panel's own terminal: output, exit and typed lines; other ids and other commands → null", () => {
    expect(terminalEvent({ command: "terminal_output", id, data: "hi" }, id)).toEqual({ type: "output", data: "hi" });
    expect(terminalEvent({ command: "terminal_exit", id, code: 2 }, id)).toEqual({ type: "exit", code: 2 });
    expect(terminalEvent({ command: "terminal_line", id, task_id: "t_1", line: "ls" }, id)).toEqual({ type: "line", line: "ls" });
    expect(terminalEvent({ command: "terminal_output", id: "term_ffffffffffffffff", data: "x" }, id)).toBeNull();
    expect(terminalEvent({ command: "new_task" }, id)).toBeNull();
    expect(terminalEvent({ command: "terminal_output", id, data: "x" }, null)).toBeNull();
  });

  it("a typed line → a local_terminal command for task_activities, cut to the contract's 300", () => {
    expect(terminalActivity("pnpm test")).toEqual({ kind: "local_terminal", outcome: "command", detail: "pnpm test" });
    expect(terminalActivity("x".repeat(400)).detail).toHaveLength(300);
  });

  it("the folders a terminal may open in: granted with the terminal scope", () => {
    const g = (path: string, scopes: ("read" | "apply" | "open_editor" | "terminal")[]) => ({ path, scopes, granted_at: "2026-10-24T02:00:00.000Z" });
    expect(terminalFolders([g("/w/a", ["read", "terminal"]), g("/w/b", ["apply"]), g("/w/c", ["terminal"])])).toEqual(["/w/a", "/w/c"]);
  });
});
