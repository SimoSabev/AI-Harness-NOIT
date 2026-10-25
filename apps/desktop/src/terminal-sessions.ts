import { randomBytes } from "node:crypto";
import path from "node:path";
import type { DesktopCommand, DesktopError, DesktopResult } from "@mandat/contract";
import { childEnv } from "./banner.js";
import type { DesktopHandlers } from "./bridge-main.js";
import { dt } from "./i18n.js";
import type { DesktopKey, Lang } from "./i18n.js";
import { LineTracker } from "./terminal-lines.js";

// E9g A4 (AC-12.8, D-375): the host terminal — the person's own shell in a granted folder with the `terminal` scope, on
// this computer, NOT the sandbox (the web says so on the panel). Pure of Electron and node-pty: main passes in the grant
// check, a lazy node-pty loader and the sender. The shell's env has no API keys and no KEK (childEnv). Each typed line
// goes out as terminal_line for task_activities; the output never goes anywhere but the window.

export const MAX_TERMINALS = 4;
const CHUNK = 32_768;

/** The part of node-pty's IPty that is used. */
export interface PtyLike {
  onData(cb: (data: string) => void): unknown;
  onExit(cb: (e: { exitCode: number }) => void): unknown;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}
export type SpawnPty = (o: { cwd: string; cols: number; rows: number }) => PtyLike;

export interface TerminalDeps {
  lang: Lang;
  /** the real path inside a folder granted with `terminal`, or the refusal to answer */
  authorize: (p: string) => { ok: true; path: string } | { ok: false; res: DesktopResult<never> };
  /** node-pty, loaded on first use; null when this build has none (Linux without a native build) */
  loadPty: () => Promise<SpawnPty | null>;
  send: (cmd: DesktopCommand) => void;
  newId?: () => string;
  /** when to flush batched output (default: 16 ms) */
  schedule?: (fn: () => void) => void;
}

type TerminalMethods = Pick<DesktopHandlers, "terminalOpen" | "terminalWrite" | "terminalResize" | "terminalClose">;

interface Session {
  pty: PtyLike;
  cwd: string;
  taskId: string;
  lines: LineTracker;
  pending: string;
  scheduled: boolean;
}

export function shellFor(env: Record<string, string | undefined>, platform: NodeJS.Platform): string {
  if (platform === "win32") return env.COMSPEC && env.COMSPEC !== "" ? env.COMSPEC : "powershell.exe";
  const sh = env.SHELL;
  return sh !== undefined && path.isAbsolute(sh) ? sh : "/bin/sh";
}

/** A login shell on macOS/Linux: a GUI app starts with a short PATH, the person's own terminal would not. */
export function shellArgs(platform: NodeJS.Platform): string[] {
  return platform === "win32" ? [] : ["-l"];
}

export function ptyEnv(env: Record<string, string | undefined>): Record<string, string> {
  return { ...childEnv(env), TERM: "xterm-256color", COLORTERM: "truecolor", MANDAT_HOST_TERMINAL: "1" };
}

export function terminalSessions(d: TerminalDeps): { handlers: TerminalMethods; closeWhere: (pred: (cwd: string) => boolean) => void; closeAll: () => void; count: () => number } {
  const sessions = new Map<string, Session>();
  const newId = d.newId ?? (() => `term_${randomBytes(8).toString("hex")}`);
  const schedule = d.schedule ?? ((fn: () => void) => void setTimeout(fn, 16));
  const no = (code: DesktopError["code"], key: DesktopKey): DesktopResult<never> => ({ ok: false, error: { code, message: dt(d.lang, key) } });
  const unknown = () => no("failed", "refuse.terminal_unknown");

  const flush = (id: string): void => {
    const s = sessions.get(id);
    if (!s) return;
    s.scheduled = false;
    while (s.pending.length > 0) {
      d.send({ command: "terminal_output", id, data: s.pending.slice(0, CHUNK) });
      s.pending = s.pending.slice(CHUNK);
    }
  };
  const close = (id: string): void => {
    const s = sessions.get(id);
    if (!s) return;
    sessions.delete(id); // first, so its exit sends nothing
    try {
      s.pty.kill();
    } catch {
      // already gone
    }
  };

  const handlers: TerminalMethods = {
    terminalOpen: async (req) => {
      const a = d.authorize(req.path);
      if (!a.ok) return a.res;
      const spawn = await d.loadPty();
      if (!spawn) return no("not_ready", "refuse.terminal_unavailable");
      if (sessions.size >= MAX_TERMINALS) return no("failed", "refuse.terminal_limit");
      let pty: PtyLike;
      try {
        pty = spawn({ cwd: a.path, cols: req.cols, rows: req.rows });
      } catch {
        return no("failed", "refuse.terminal_unavailable");
      }
      const id = newId();
      const s: Session = { pty, cwd: a.path, taskId: req.task_id, lines: new LineTracker(), pending: "", scheduled: false };
      sessions.set(id, s);
      pty.onData((data) => {
        if (sessions.get(id) !== s) return;
        s.pending += data;
        if (!s.scheduled) {
          s.scheduled = true;
          schedule(() => flush(id));
        }
      });
      pty.onExit((e) => {
        if (sessions.get(id) !== s) return;
        flush(id);
        sessions.delete(id);
        d.send({ command: "terminal_exit", id, code: Number.isInteger(e.exitCode) ? e.exitCode : null });
      });
      return { ok: true, value: { id } };
    },
    terminalWrite: (req) => {
      const s = sessions.get(req.id);
      if (!s) return Promise.resolve(unknown());
      for (const line of s.lines.feed(req.data)) d.send({ command: "terminal_line", id: req.id, task_id: s.taskId, line });
      s.pty.write(req.data);
      return Promise.resolve({ ok: true, value: {} });
    },
    terminalResize: (req) => {
      const s = sessions.get(req.id);
      if (!s) return Promise.resolve(unknown());
      try {
        s.pty.resize(req.cols, req.rows);
      } catch {
        // a shell that just ended; its exit follows
      }
      return Promise.resolve({ ok: true, value: {} });
    },
    terminalClose: (req) => {
      if (!sessions.has(req.id)) return Promise.resolve(unknown());
      close(req.id);
      return Promise.resolve({ ok: true, value: {} });
    },
  };
  return {
    handlers,
    closeWhere: (pred) => {
      for (const [id, s] of [...sessions]) if (pred(s.cwd)) close(id);
    },
    closeAll: () => {
      for (const id of [...sessions.keys()]) close(id);
    },
    count: () => sessions.size,
  };
}
