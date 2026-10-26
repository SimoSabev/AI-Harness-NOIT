import { AccountName, LoginCode, findDeviceLogin, findLoginUrl } from "@mandat/contract";
import type { LoginFailure, LoginState } from "@mandat/contract";
import type { ProfileStatus } from "./accounts.js";

// D-369: the subscription login from the web. `mandat local` runs the unchanged `claude auth login --claudeai` in a
// container with plain pipes (no TTY; spike 23.10.2026, Claude Code 2.1.302: it prints the authorize address and
// „Paste code here if prompted >“, then reads one line). The web sees only the state below; the code goes to stdin and
// nowhere else. One login at a time; a forgotten one is stopped after `timeoutMs`. D-393: a ChatGPT sign-in runs
// `codex login --device-auth`: OpenAI's page and a one-time code are shown; the process ends when the person is done.
export type LoginCli = "claude" | "codex";
export interface LoginProc {
  onOutput(f: (chunk: string) => void): void;
  onExit(f: (code: number | null) => void): void;
  write(s: string): void;
  kill(): void;
}

export interface LoginDeps {
  /** image present, upstream network, the profile volume owned by the agent user ("created" = it did not exist before) */
  prepare(name: string, cli: LoginCli): Promise<"ok" | "created" | "images_missing" | "failed">;
  /** removes the profile volume of a new account whose login did not finish */
  discard(name: string, cli: LoginCli): Promise<void>;
  spawn(name: string, cli: LoginCli): LoginProc;
  status(name: string, cli: LoginCli): Promise<ProfileStatus>;
  timeoutMs: number;
}

const MAX_OUTPUT = 64 * 1024;
const active = (s: LoginState) => s.state === "starting" || s.state === "waiting_code" || s.state === "waiting_device" || s.state === "checking";

export class LoginSessions {
  private current: LoginState = { state: "idle" };
  private proc: LoginProc | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private gen = 0;
  /** this login made the profile volume, so an unfinished login removes it again (no empty "not signed in" account) */
  private created = false;
  private exited: Promise<void> = Promise.resolve();
  private cli: LoginCli = "claude";

  constructor(private readonly d: LoginDeps) {}

  state(): LoginState {
    return this.current;
  }

  async start(rawName: string, cli: LoginCli = "claude"): Promise<LoginState> {
    const name = AccountName.parse(rawName);
    if (active(this.current)) return { state: "failed", name, reason: "busy" };
    const gen = ++this.gen;
    this.created = false;
    this.cli = cli;
    this.current = { state: "starting", name };
    void this.run(gen, name);
    return this.current;
  }

  /** The code the person pasted → stdin of the waiting process. null = refused (no waiting login, or not a code). */
  submit(rawCode: string): LoginState | null {
    const c = LoginCode.safeParse(rawCode);
    if (this.current.state !== "waiting_code" || !this.proc || !c.success) return null;
    this.current = { state: "checking", name: this.current.name };
    this.proc.write(`${c.data}\n`);
    return this.current;
  }

  cancel(): LoginState {
    if (active(this.current)) this.fail("cancelled");
    return this.current;
  }

  private async run(gen: number, name: string): Promise<void> {
    const cli = this.cli;
    const ready = await this.d.prepare(name, cli).catch(() => "failed" as const);
    if (gen !== this.gen || this.current.state !== "starting") return;
    if (ready !== "ok" && ready !== "created") return this.fail(ready === "images_missing" ? "images_missing" : "start_failed");
    this.created = ready === "created";
    let proc: LoginProc;
    try {
      proc = this.d.spawn(name, cli);
    } catch {
      return this.fail("start_failed");
    }
    this.proc = proc;
    let exited: () => void = () => undefined;
    this.exited = new Promise((r) => (exited = r));
    this.timer = setTimeout(() => gen === this.gen && this.fail("timeout"), this.d.timeoutMs);
    this.timer.unref?.();
    let out = "";
    proc.onOutput((chunk) => {
      if (gen !== this.gen) return;
      out = (out + chunk).slice(-MAX_OUTPUT);
      if (this.current.state === "starting" && cli === "codex") {
        const dev = findDeviceLogin(out);
        if (dev) this.current = { state: "waiting_device", name, url: dev.url, code: dev.code };
      } else if (this.current.state === "starting") {
        const url = findLoginUrl(out);
        if (url) this.current = { state: "waiting_code", name, url };
      } else if (this.current.state === "checking" && /invalid code/i.test(out)) this.fail("invalid_code");
    });
    proc.onExit(() => {
      exited();
      if (gen !== this.gen || !active(this.current)) return;
      this.stopTimer();
      this.proc = null;
      if (this.current.state === "starting") return this.fail("no_url");
      this.current = { state: "checking", name };
      void this.d.status(name, cli).then(
        (s) => {
          if (gen !== this.gen) return;
          if (!s.loggedIn) return this.fail("not_logged_in");
          this.created = false;
          this.current = { state: "done", name, email: s.email, plan: s.plan };
        },
        () => gen === this.gen && this.fail("not_logged_in"),
      );
    });
  }

  private fail(reason: LoginFailure): void {
    if (this.current.state === "idle") return;
    this.current = { state: "failed", name: this.current.name, reason };
    this.stopTimer();
    const p = this.proc;
    this.proc = null;
    p?.kill();
    if (this.created) {
      this.created = false;
      const name = this.current.name;
      const cli = this.cli;
      void (p ? this.exited : Promise.resolve()).then(() => this.d.discard(name, cli)).catch(() => undefined);
    }
  }

  private stopTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
