import type { DesktopCommand, LocalActivityBody, LocalGrant } from "@mandat/contract";

// E9g A4 (AC-12.8, D-375): pure helpers of the host terminal panel. The shell runs in the desktop app's main process, on
// this computer and NOT in the sandbox; main checks the `terminal` scope again on every open.

export type TerminalEvent = { type: "output"; data: string } | { type: "exit"; code: number | null } | { type: "line"; line: string };

/** A command from main that belongs to the panel's own terminal, or null. */
export function terminalEvent(cmd: DesktopCommand, id: string | null): TerminalEvent | null {
  if (id === null) return null;
  switch (cmd.command) {
    case "terminal_output":
      return cmd.id === id ? { type: "output", data: cmd.data } : null;
    case "terminal_exit":
      return cmd.id === id ? { type: "exit", code: cmd.code } : null;
    case "terminal_line":
      return cmd.id === id ? { type: "line", line: cmd.line } : null;
    default:
      return null;
  }
}

/** A typed line for task_activities (not the ledger); the server redacts secrets before storing it. */
export function terminalActivity(line: string): LocalActivityBody {
  return { kind: "local_terminal", outcome: "command", detail: line.slice(0, 300) };
}

export function terminalFolders(grants: readonly LocalGrant[]): string[] {
  return grants.filter((g) => g.scopes.includes("terminal")).map((g) => g.path);
}
