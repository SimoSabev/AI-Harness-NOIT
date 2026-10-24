import { z } from "zod";
import { AddProjectReply, JobState, LoginState } from "@mandat/contract";
import type { SystemJob } from "@mandat/contract";

// D-293: the web server forwards API keys to the control endpoint of `mandat local` (127.0.0.1 + bearer token), which
// starts the proxy with them. The web server keeps nothing: no database row, no file, no log, no echo.
export const KeysBody = z.object({
  anthropic: z.string().trim().regex(/^[\x21-\x7e]{20,512}$/),
  openai: z.string().trim().regex(/^([\x21-\x7e]{20,512})?$/).optional(),
}).strict();

export interface KeysStatus { proxy: "running" | "stopped" | "unavailable"; providers: string[] }
export interface Account { name: string; agent: string; loggedIn: boolean; email: string | null; plan: string | null }
/** D-369: the subscription login of `mandat local` (the code goes to the control endpoint and on to stdin, nowhere else). */
export type LoginOp = { kind: "state" } | { kind: "start"; name: string } | { kind: "code"; code: string } | { kind: "cancel" };
export type LoginReply = { ok: true; state: LoginState } | { ok: false; error: string };

export interface KeysClient {
  login(op: LoginOp): Promise<LoginReply>;
  logout(name: string): Promise<boolean | null>;
  /** D-370: the CLI commands of `mandat local` (page System); null = the control endpoint did not answer */
  jobs(): Promise<JobState[] | null>;
  runJob(job: SystemJob): Promise<JobState | null>;
  /** D-388: "Add project" — a git folder of this computer becomes a project; null = the control endpoint did not answer */
  addProject(path: string): Promise<AddProjectReply | null>;
  /** D-295: the subscription accounts of `mandat local` */
  accounts(): Promise<Account[]>;
  status(): Promise<KeysStatus>;
  set(k: { anthropic: string; openai?: string }): Promise<KeysStatus | null>;
  clear(): Promise<KeysStatus>;
}

const Accounts = z.object({
  accounts: z.array(z.object({ name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/), agent: z.string(), loggedIn: z.boolean(), email: z.string().max(320).nullable(), plan: z.string().max(100).nullable() })).max(50),
});
const Status = z.object({ proxy: z.enum(["running", "stopped"]), providers: z.array(z.enum(["anthropic", "openai"])) });

export function controlKeys(env: Record<string, string | undefined>): KeysClient | null {
  const url = env.MANDAT_LOCAL_CONTROL_URL;
  const token = env.MANDAT_LOCAL_CONTROL_TOKEN;
  if (!url || !token || !/^http:\/\/127\.0\.0\.1:\d+$/.test(url)) return null;
  const call = async (method: string, body?: unknown): Promise<KeysStatus | null> => {
    const r = await fetch(`${url}/keys`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(90_000),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const s = Status.safeParse(await r.json().catch(() => null));
    return s.success ? s.data : null;
  };
  const down: KeysStatus = { proxy: "unavailable", providers: [] };
  const accounts = async (): Promise<Account[]> => {
    const r = await fetch(`${url}/accounts`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(90_000), cache: "no-store" }).catch(() => null);
    const a = Accounts.safeParse(r?.ok ? await r.json().catch(() => null) : null);
    return a.success ? a.data.accounts : [];
  };
  const send = (method: string, path: string, body?: unknown) =>
    fetch(`${url}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  const Err = z.object({ error: z.string().max(40) });
  const login = async (op: LoginOp): Promise<LoginReply> => {
    const r = await (op.kind === "state" ? send("GET", "/accounts/login") : op.kind === "cancel" ? send("DELETE", "/accounts/login") : op.kind === "start" ? send("POST", "/accounts/login", { name: op.name }) : send("POST", "/accounts/login/code", { code: op.code })).catch(() => null);
    const j: unknown = await r?.json().catch(() => null);
    if (r?.ok) {
      const s = LoginState.safeParse(j);
      return s.success ? { ok: true, state: s.data } : { ok: false, error: "control_unavailable" };
    }
    const e = Err.safeParse(j);
    return { ok: false, error: r && r.status === 400 && e.success ? e.data.error : "control_unavailable" };
  };
  const logout = async (name: string): Promise<boolean | null> => {
    const r = await send("POST", "/accounts/logout", { name }).catch(() => null);
    const j = z.object({ removed: z.boolean() }).safeParse(r?.ok ? await r.json().catch(() => null) : null);
    return j.success ? j.data.removed : null;
  };
  const jobs = async (): Promise<JobState[] | null> => {
    const r = await send("GET", "/system").catch(() => null);
    const j = z.object({ jobs: z.array(JobState) }).safeParse(r?.ok ? await r.json().catch(() => null) : null);
    return j.success ? j.data.jobs : null;
  };
  const runJob = async (job: SystemJob): Promise<JobState | null> => {
    const r = await send("POST", `/system/${job}`).catch(() => null);
    const j = JobState.safeParse(r?.ok ? await r.json().catch(() => null) : null);
    return j.success ? j.data : null;
  };
  const addProject = async (path: string): Promise<AddProjectReply | null> => {
    const r = await send("POST", "/projects", { path }).catch(() => null);
    const j = AddProjectReply.safeParse(r?.ok ? await r.json().catch(() => null) : null);
    return j.success ? j.data : null;
  };
  return {
    login,
    logout,
    jobs,
    runJob,
    addProject,
    accounts,
    status: async () => (await call("GET").catch(() => null)) ?? down,
    set: (k) => call("POST", k).catch(() => null),
    clear: async () => (await call("DELETE").catch(() => null)) ?? down,
  };
}
