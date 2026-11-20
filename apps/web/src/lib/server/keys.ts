import { z } from "zod";
import { AddConnectionReply, AddProjectReply, BringReply, CheckKeyReply, ConnectionsReply, DetectReply, FolderListing, FoundProjects, JobState, LoginState, SubscriptionId } from "@mandat/contract";
import type { AddConnectionBody, BringBody, ModelsBody, Preferences, SystemJob } from "@mandat/contract";

// D-293: the web server forwards API keys to the control endpoint of `mandat local` (127.0.0.1 + bearer token), which
// starts the proxy with them. The web server keeps nothing: no database row, no file, no log, no echo.
export const KeysBody = z.object({
  anthropic: z.string().trim().regex(/^[\x21-\x7e]{20,512}$/),
  openai: z.string().trim().regex(/^([\x21-\x7e]{20,512})?$/).optional(),
}).strict();

/** D-440: the research search key (Exa); it goes to the proxy like the model keys and never comes back */
export const ResearchKeyBody = z.object({ exa: z.string().trim().regex(/^[\x21-\x7e]{20,512}$/) }).strict();

export interface KeysStatus { proxy: "running" | "stopped" | "unavailable"; providers: string[] }
export interface Account { name: string; agent: string; loggedIn: boolean; email: string | null; plan: string | null; /** D-460: the provider of the subscription registry (D-393: Claude Code or Codex) */ cli: SubscriptionId }
/** D-369: the subscription login of `mandat local` (the code goes to the control endpoint and on to stdin, nowhere else). */
export type LoginOp = { kind: "state" } | { kind: "start"; name: string; cli?: SubscriptionId } | { kind: "code"; code: string } | { kind: "cancel" };
export type LoginReply = { ok: true; state: LoginState } | { ok: false; error: string };

/** D-388 (folder picker): a listing, why not, or null when the control endpoint did not answer */
export type FoldersReply = FolderListing | "bad_path" | "not_a_folder" | null;

export interface KeysClient {
  login(op: LoginOp): Promise<LoginReply>;
  logout(name: string, cli?: SubscriptionId): Promise<boolean | null>;
  /** D-393: the saved connections and the task box defaults; null = the control endpoint did not answer */
  connections(): Promise<ConnectionsReply | null>;
  addConnection(b: AddConnectionBody): Promise<AddConnectionReply | null>;
  setModels(id: string, b: ModelsBody): Promise<boolean | null>;
  removeConnection(id: string): Promise<boolean | null>;
  /** D-472: "Check the key" — one cheap request by `mandat local`; null = unknown id or no answer */
  checkConnection(id: string): Promise<CheckKeyReply | null>;
  detect(): Promise<DetectReply | null>;
  setPrefs(p: Partial<Preferences>): Promise<boolean>;
  /** D-370: the CLI commands of `mandat local` (page System); null = the control endpoint did not answer */
  jobs(): Promise<JobState[] | null>;
  runJob(job: SystemJob): Promise<JobState | null>;
  /** D-388: "Add project" — a git folder of this computer becomes a project; null = the control endpoint did not answer */
  addProject(path: string): Promise<AddProjectReply | null>;
  /** D-540: "Bring into my folder" — the safe fast-forward of the project's own folder; null = no answer */
  bring?: (b: BringBody) => Promise<BringReply | null>;
  /** D-388 (folder picker): the sub-folders of a folder of this computer (no path → the home folder); names and paths only */
  folders(path?: string): Promise<FoldersReply>;
  /** D-388 (folder picker): git projects found in the usual places; null = the control endpoint did not answer */
  foundProjects(): Promise<FoundProjects | null>;
  /** D-295: the subscription accounts of `mandat local` */
  accounts(): Promise<Account[]>;
  status(): Promise<KeysStatus>;
  set(k: { anthropic: string; openai?: string }): Promise<KeysStatus | null>;
  clear(): Promise<KeysStatus>;
  /** D-440: seal the Exa key and restart the proxy with it; null = the control endpoint did not take it */
  setResearch(k: { exa: string }): Promise<KeysStatus | null>;
  clearResearch(): Promise<KeysStatus | null>;
  /** D-556: Jarvis — seal the ElevenLabs key and restart the proxy with it; make the agent; one session's signed URL */
  setVoice?: (k: { elevenlabs: string }) => Promise<KeysStatus | null>;
  clearVoice?: () => Promise<KeysStatus | null>;
  voiceAgent?: (voiceId: string) => Promise<VoiceReply>;
  voiceSession?: () => Promise<VoiceReply>;
}
/** D-556: what the proxy answered for the voice — an id, a signed URL or an error name; never a key */
export type VoiceReply = { agent_id: string } | { signed_url: string } | { error: string };
export const VoiceKeyBody = z.object({ elevenlabs: z.string().regex(/^[!-~]{20,512}$/) }).strict();
export const VoiceAgentBody = z.object({ voice_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).strict();
const VoiceAnswer = z.union([
  z.object({ agent_id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/) }).strict(),
  z.object({ signed_url: z.string().url().startsWith("wss://") }).strict(),
  z.object({ error: z.string().regex(/^[a-z_]{1,40}$/) }).strict(),
]);

const Accounts = z.object({
  accounts: z.array(z.object({ name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/), agent: z.string(), loggedIn: z.boolean(), email: z.string().max(320).nullable(), plan: z.string().max(100).nullable(), cli: SubscriptionId.default("claude") })).max(50),
});
const Status = z.object({ proxy: z.enum(["running", "stopped"]), providers: z.array(z.enum(["anthropic", "openai", "exa", "elevenlabs"])) });

export function controlKeys(env: Record<string, string | undefined>): KeysClient | null {
  const url = env.MANDAT_LOCAL_CONTROL_URL;
  const token = env.MANDAT_LOCAL_CONTROL_TOKEN;
  if (!url || !token || !/^http:\/\/127\.0\.0\.1:\d+$/.test(url)) return null;
  const call = async (method: string, body?: unknown, path = "/keys"): Promise<KeysStatus | null> => {
    const r = await fetch(`${url}${path}`, {
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
  const send = (method: string, path: string, body?: unknown, timeoutMs = 30_000) =>
    fetch(`${url}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  // D-393: zod on every answer; a key never travels this way back (AddConnectionReply has no key field)
  const parsed = async <T>(p: Promise<Response | null>, schema: z.ZodType<T>): Promise<T | null> => {
    const r = await p.catch(() => null);
    const j = schema.safeParse(r?.ok || r?.status === 400 ? await r.json().catch(() => null) : null);
    return j.success ? j.data : null;
  };
  const Done = z.object({ ok: z.literal(true) }).passthrough();
  const Removed = z.object({ removed: z.boolean() });
  const Err = z.object({ error: z.string().max(40) });
  const login = async (op: LoginOp): Promise<LoginReply> => {
    const r = await (op.kind === "state" ? send("GET", "/accounts/login") : op.kind === "cancel" ? send("DELETE", "/accounts/login") : op.kind === "start" ? send("POST", "/accounts/login", { name: op.name, ...(op.cli ? { cli: op.cli } : {}) }) : send("POST", "/accounts/login/code", { code: op.code })).catch(() => null);
    const j: unknown = await r?.json().catch(() => null);
    if (r?.ok) {
      const s = LoginState.safeParse(j);
      return s.success ? { ok: true, state: s.data } : { ok: false, error: "control_unavailable" };
    }
    const e = Err.safeParse(j);
    return { ok: false, error: r && r.status === 400 && e.success ? e.data.error : "control_unavailable" };
  };
  const logout = async (name: string, cli?: SubscriptionId): Promise<boolean | null> => {
    const r = await send("POST", "/accounts/logout", { name, ...(cli ? { cli } : {}) }).catch(() => null);
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
  // D-556: making the agent talks to ElevenLabs (tools + agent): up to a minute
  const voice = async (path: string, body: unknown): Promise<VoiceReply> => {
    const r = await send("POST", path, body, 90_000).catch(() => null);
    const j = VoiceAnswer.safeParse(r ? await r.json().catch(() => null) : null);
    return j.success ? j.data : { error: "control_unavailable" };
  };
  const bring = async (b: BringBody): Promise<BringReply | null> => {
    const r = await send("POST", "/projects/bring", b).catch(() => null);
    const j = BringReply.safeParse(r?.ok ? await r.json().catch(() => null) : null);
    return j.success ? j.data : null;
  };
  const folders = async (p?: string): Promise<FoldersReply> => {
    const r = await send("GET", p === undefined ? "/folders" : `/folders?path=${encodeURIComponent(p)}`).catch(() => null);
    const j: unknown = await r?.json().catch(() => null);
    const e = Err.safeParse(j);
    if (r && (r.status === 400 || r.status === 404) && e.success && (e.data.error === "bad_path" || e.data.error === "not_a_folder")) return e.data.error;
    const l = FolderListing.safeParse(r?.ok ? j : null);
    return l.success ? l.data : null;
  };
  return {
    login,
    logout,
    folders,
    foundProjects: () => parsed(send("GET", "/folders/found"), FoundProjects),
    connections: () => parsed(send("GET", "/connections"), ConnectionsReply),
    // the key check talks to the provider: up to ~20 s, plus the proxy restart
    addConnection: (b) => parsed(send("POST", "/connections", b, 90_000), AddConnectionReply),
    setModels: async (id, b) => (await parsed(send("PATCH", `/connections/${encodeURIComponent(id)}`, b, 90_000), Done)) !== null,
    removeConnection: async (id) => (await parsed(send("DELETE", `/connections/${encodeURIComponent(id)}`, undefined, 90_000), Removed))?.removed ?? null,
    checkConnection: async (id) => {
      const r = await send("POST", `/connections/${encodeURIComponent(id)}/check`, undefined, 30_000).catch(() => null);
      const j = CheckKeyReply.safeParse(r?.ok ? await r.json().catch(() => null) : null);
      return j.success ? j.data : null;
    },
    detect: () => parsed(send("GET", "/connections/detect"), DetectReply),
    setPrefs: async (p) => (await parsed(send("PUT", "/preferences", p), Done)) !== null,
    jobs,
    runJob,
    addProject,
    bring,
    accounts,
    status: async () => (await call("GET").catch(() => null)) ?? down,
    set: (k) => call("POST", k).catch(() => null),
    clear: async () => (await call("DELETE").catch(() => null)) ?? down,
    setResearch: (k) => call("POST", k, "/keys/research").catch(() => null),
    clearResearch: () => call("DELETE", undefined, "/keys/research").catch(() => null),
    setVoice: (k) => call("POST", k, "/keys/voice").catch(() => null),
    clearVoice: () => call("DELETE", undefined, "/keys/voice").catch(() => null),
    voiceAgent: (voiceId) => voice("/voice/agent", { voice_id: voiceId }),
    voiceSession: () => voice("/voice/session", {}),
  };
}
