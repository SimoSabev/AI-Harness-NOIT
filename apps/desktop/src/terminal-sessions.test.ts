import { describe, expect, it } from "vitest";
import type { DesktopCommand, DesktopResult } from "@mandat/contract";
import { MAX_TERMINALS, ptyEnv, shellArgs, shellFor, terminalSessions } from "./terminal-sessions.js";
import type { PtyLike, SpawnPty, TerminalDeps } from "./terminal-sessions.js";

// E9g A4 (AC-12.8, D-375): host terminals in main. Only in a granted folder with the `terminal` scope; the person's own
// shell with an env without API keys or the KEK; output batched to the page; every typed line goes out as terminal_line
// (the web writes it to task_activities). Revoking the scope closes the terminals in that folder.

class FakePty implements PtyLike {
  written: string[] = [];
  size: [number, number];
  killed = false;
  private data: ((d: string) => void) | null = null;
  private exit: ((e: { exitCode: number }) => void) | null = null;
  constructor(
    readonly cwd: string,
    cols: number,
    rows: number,
  ) {
    this.size = [cols, rows];
  }
  onData(cb: (d: string) => void) {
    this.data = cb;
  }
  onExit(cb: (e: { exitCode: number }) => void) {
    this.exit = cb;
  }
  write(d: string) {
    this.written.push(d);
  }
  resize(c: number, r: number) {
    this.size = [c, r];
  }
  kill() {
    this.killed = true;
    this.exit?.({ exitCode: 0 });
  }
  emit(d: string) {
    this.data?.(d);
  }
  end(code: number) {
    this.exit?.({ exitCode: code });
  }
}

function setup(o: Partial<TerminalDeps> & { granted?: string[] } = {}) {
  const ptys: FakePty[] = [];
  const sent: DesktopCommand[] = [];
  const queue: (() => void)[] = [];
  let n = 0;
  const spawn: SpawnPty = (s) => {
    const p = new FakePty(s.cwd, s.cols, s.rows);
    ptys.push(p);
    return p;
  };
  const granted = o.granted ?? ["/w/shop"];
  const deps: TerminalDeps = {
    lang: "en",
    authorize: (p) =>
      granted.some((g) => p === g || p.startsWith(`${g}/`)) ? { ok: true, path: p } : { ok: false, res: { ok: false, error: { code: "not_granted", message: "no" } } },
    loadPty: () => Promise.resolve(spawn),
    send: (c) => void sent.push(c),
    newId: () => `term_${(n++).toString(16).padStart(16, "0")}`,
    schedule: (fn) => void queue.push(fn),
    ...o,
  };
  const flush = () => {
    for (const f of queue.splice(0)) f();
  };
  return { s: terminalSessions(deps), ptys, sent, flush };
}

const val = <T,>(r: DesktopResult<T>): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

describe("host terminals (AC-12.8, D-375)", () => {
  it("opens the shell in the granted folder with the asked size; refuses outside a grant, before spawning", async () => {
    const { s, ptys } = setup();
    const { id } = val(await s.handlers.terminalOpen({ task_id: "t_1", path: "/w/shop", cols: 80, rows: 24 }));
    expect(id).toBe("term_0000000000000000");
    expect(ptys[0]?.cwd).toBe("/w/shop");
    expect(ptys[0]?.size).toEqual([80, 24]);
    const r = await s.handlers.terminalOpen({ task_id: "t_1", path: "/etc", cols: 80, rows: 24 });
    expect(r.ok === false && r.error.code).toBe("not_granted");
    expect(ptys).toHaveLength(1);
  });

  it("no node-pty in this build → not_ready, nothing spawned", async () => {
    const { s } = setup({ loadPty: () => Promise.resolve(null) });
    const r = await s.handlers.terminalOpen({ task_id: "t_1", path: "/w/shop", cols: 80, rows: 24 });
    expect(r.ok === false && r.error.code).toBe("not_ready");
    expect(r.ok === false && r.error.message).toContain("not available");
  });

  it(`at most ${MAX_TERMINALS} terminals at once`, async () => {
    const { s } = setup();
    for (let i = 0; i < MAX_TERMINALS; i += 1) val(await s.handlers.terminalOpen({ task_id: "t_1", path: "/w/shop", cols: 80, rows: 24 }));
    const r = await s.handlers.terminalOpen({ task_id: "t_1", path: "/w/shop", cols: 80, rows: 24 });
    expect(r.ok === false && r.error.code).toBe("failed");
    expect(s.count()).toBe(MAX_TERMINALS);
  });

  it("keystrokes go to the shell; each completed line goes out as terminal_line with the task", async () => {
    const { s, ptys, sent } = setup();
    const { id } = val(await s.handlers.terminalOpen({ task_id: "t_9", path: "/w/shop", cols: 80, rows: 24 }));
    val(await s.handlers.terminalWrite({ id, data: "pnpm te" }));
    val(await s.handlers.terminalWrite({ id, data: "st\r" }));
    expect(ptys[0]?.written).toEqual(["pnpm te", "st\r"]);
    expect(sent).toEqual([{ command: "terminal_line", id, task_id: "t_9", line: "pnpm test" }]);
  });

  it("output is batched per tick and cut into chunks the contract accepts", async () => {
    const { s, ptys, sent, flush } = setup();
    const { id } = val(await s.handlers.terminalOpen({ task_id: "t_1", path: "/w/shop", cols: 80, rows: 24 }));
    ptys[0]?.emit("a");
    ptys[0]?.emit("b");
    expect(sent).toEqual([]);
    flush();
    expect(sent).toEqual([{ command: "terminal_output", id, data: "ab" }]);
    ptys[0]?.emit("x".repeat(70_000));
    flush();
    const chunks = sent.slice(1).map((c) => (c.command === "terminal_output" ? c.data.length : -1));
    expect(chunks.every((l) => l > 0 && l <= 32_768)).toBe(true);
    expect(chunks.reduce((a, b) => a + b, 0)).toBe(70_000);
  });

  it("the shell ends → pending output, then terminal_exit with the code; the id is gone", async () => {
    const { s, ptys, sent } = setup();
    const { id } = val(await s.handlers.terminalOpen({ task_id: "t_1", path: "/w/shop", cols: 80, rows: 24 }));
    ptys[0]?.emit("bye");
    ptys[0]?.end(3);
    expect(sent).toEqual([
      { command: "terminal_output", id, data: "bye" },
      { command: "terminal_exit", id, code: 3 },
    ]);
    const r = await s.handlers.terminalWrite({ id, data: "x" });
    expect(r.ok === false && r.error.code).toBe("failed");
  });

  it("resize and close act on the right session; an unknown id is refused", async () => {
    const { s, ptys } = setup();
    const { id } = val(await s.handlers.terminalOpen({ task_id: "t_1", path: "/w/shop", cols: 80, rows: 24 }));
    val(await s.handlers.terminalResize({ id, cols: 120, rows: 40 }));
    expect(ptys[0]?.size).toEqual([120, 40]);
    val(await s.handlers.terminalClose({ id }));
    expect(ptys[0]?.killed).toBe(true);
    expect(s.count()).toBe(0);
    const r = await s.handlers.terminalResize({ id: "term_ffffffffffffffff", cols: 80, rows: 24 });
    expect(r.ok === false && r.error.message).toBe("This terminal is closed.");
  });

  it("revoking: closeWhere kills the terminals whose folder is no longer allowed; closeAll kills the rest", async () => {
    const { s, ptys } = setup({ granted: ["/w/shop", "/w/blog"] });
    val(await s.handlers.terminalOpen({ task_id: "t_1", path: "/w/shop", cols: 80, rows: 24 }));
    val(await s.handlers.terminalOpen({ task_id: "t_1", path: "/w/blog/src", cols: 80, rows: 24 }));
    s.closeWhere((cwd) => cwd.startsWith("/w/blog"));
    expect(ptys.map((p) => p.killed)).toEqual([false, true]);
    s.closeAll();
    expect(ptys.map((p) => p.killed)).toEqual([true, true]);
    expect(s.count()).toBe(0);
  });

  it("a spawn that throws (no shell) → failed, nothing kept", async () => {
    const { s } = setup({
      loadPty: () =>
        Promise.resolve(() => {
          throw new Error("posix_spawnp failed");
        }),
    });
    const r = await s.handlers.terminalOpen({ task_id: "t_1", path: "/w/shop", cols: 80, rows: 24 });
    expect(r.ok === false && r.error.code).toBe("failed");
    expect(r.ok === false && r.error.message).not.toContain("posix_spawnp");
    expect(s.count()).toBe(0);
  });
});

describe("the shell and its env (D-375)", () => {
  it("the person's login shell; Windows: COMSPEC, else PowerShell; a missing SHELL → /bin/sh", () => {
    expect(shellFor({ SHELL: "/bin/zsh" }, "darwin")).toBe("/bin/zsh");
    expect(shellFor({}, "linux")).toBe("/bin/sh");
    expect(shellFor({ SHELL: "relative/sh" }, "linux")).toBe("/bin/sh");
    expect(shellFor({ COMSPEC: "C:\\Windows\\System32\\cmd.exe" }, "win32")).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(shellFor({}, "win32")).toBe("powershell.exe");
  });

  it("a login shell on macOS and Linux (the person's PATH, as in their own terminal); no arguments on Windows", () => {
    expect(shellArgs("darwin")).toEqual(["-l"]);
    expect(shellArgs("linux")).toEqual(["-l"]);
    expect(shellArgs("win32")).toEqual([]);
  });

  it("no API keys, no KEK, no ELECTRON_RUN_AS_NODE; TERM for xterm; a marker that this is the host terminal", () => {
    expect(ptyEnv({ PATH: "/bin", HOME: "/h", ANTHROPIC_API_KEY: "x", OPENAI_API_KEY: "y", MANDAT_KEK: "k", ELECTRON_RUN_AS_NODE: "1" })).toEqual({
      PATH: "/bin",
      HOME: "/h",
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      MANDAT_HOST_TERMINAL: "1",
    });
  });
});
