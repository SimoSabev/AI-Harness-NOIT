import { z } from "zod";
import { LocalPath } from "./desktop.js";

// D-369: what crosses between `mandat local` (its control endpoint, 127.0.0.1 + bearer token) and the web server.
// The subscription login runs the unchanged `claude auth login` in a container; the web shows Anthropic's address and
// hands the code the person pastes to that process's stdin — never stored, never logged, never echoed back.

/** A profile volume name (packages/sandbox profileVolume). */
export const AccountName = z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/);

/** The code from Anthropic's page: one printable line without spaces (PKCE — useless without the process that asked). */
export const LoginCode = z.string().trim().regex(/^[\x21-\x7e]{8,512}$/);

const LOGIN_HOSTS = ["claude.com", "claude.ai", "platform.claude.com", "console.anthropic.com"];
const URL_RE = /https:\/\/[^\s"'<>]+/g;
// the BEL / ESC of an OSC 8 terminal link end an address too
const CONTROL = [String.fromCharCode(7), String.fromCharCode(27)];

export function isLoginUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === "https:" && p.username === "" && p.password === "" && p.port === "" && LOGIN_HOSTS.includes(p.hostname) && /\/oauth\/authorize$/.test(p.pathname);
  } catch {
    return false;
  }
}

/** The authorize address in the output of `claude auth login` [Claude Code 2.1.302: „If the browser didn't open, visit: …“]. */
export function findLoginUrl(text: string): string | null {
  const plain = CONTROL.reduce((t, c) => t.split(c).join(" "), text);
  for (const m of plain.matchAll(URL_RE)) if (isLoginUrl(m[0])) return m[0];
  return null;
}

// D-393: a ChatGPT sign-in is the unmodified `codex login --device-auth` [НП: the exact wording; spike when Codex runs
// live]: it prints OpenAI's device page and a one-time code; the person types the code there, nothing comes back here.
const DEVICE_HOSTS = ["auth.openai.com", "chatgpt.com"];
export function isDeviceUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === "https:" && p.username === "" && p.password === "" && p.port === "" && DEVICE_HOSTS.includes(p.hostname);
  } catch {
    return false;
  }
}
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g");
/** The device page and the one-time code in the output of `codex login --device-auth` (both, or null). */
export function findDeviceLogin(text: string): { url: string; code: string } | null {
  const plain = text.replace(ANSI, "");
  const url = [...plain.matchAll(URL_RE)].map((m) => m[0]).find(isDeviceUrl);
  const after = url ? plain.slice(plain.indexOf(url) + url.length) : "";
  const code = /\b([A-Z0-9]{4,8}-[A-Z0-9]{4,8})\b/.exec(after)?.[1];
  return url && code ? { url, code } : null;
}

/** Start a subscription sign-in: the account name and the CLI (Claude Code, or Codex for ChatGPT). */
export const LoginStart = z.object({ name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/), cli: z.enum(["claude", "codex"]).default("claude") }).strict();
export type LoginStart = z.infer<typeof LoginStart>;

export const LoginFailure = z.enum(["busy", "images_missing", "start_failed", "no_url", "invalid_code", "not_logged_in", "timeout", "cancelled"]);
export type LoginFailure = z.infer<typeof LoginFailure>;

export const LoginState = z.discriminatedUnion("state", [
  z.object({ state: z.literal("idle") }).strict(),
  z.object({ state: z.literal("starting"), name: AccountName }).strict(),
  z.object({ state: z.literal("waiting_code"), name: AccountName, url: z.string().max(4096).refine(isLoginUrl) }).strict(),
  z.object({ state: z.literal("waiting_device"), name: AccountName, url: z.string().max(4096).refine(isDeviceUrl), code: z.string().regex(/^[A-Z0-9]{4,8}-[A-Z0-9]{4,8}$/) }).strict(),
  z.object({ state: z.literal("checking"), name: AccountName }).strict(),
  z.object({ state: z.literal("done"), name: AccountName, email: z.string().max(320).nullable(), plan: z.string().max(100).nullable() }).strict(),
  z.object({ state: z.literal("failed"), name: AccountName, reason: LoginFailure }).strict(),
]);
export type LoginState = z.infer<typeof LoginState>;

// D-370: the CLI commands of `mandat local` from the web (page System) — a closed list, one run per kind at a time.
export const SystemJob = z.enum(["doctor", "images", "images-ui", "fixtures", "fixtures-force", "stats", "verify-log"]);
export type SystemJob = z.infer<typeof SystemJob>;

/** The argv of each job (`mandat …`); several steps run one after another. `verify-log` checks the local org's ledger. */
export const SYSTEM_JOB_ARGV: Record<SystemJob, readonly (readonly string[])[]> = {
  doctor: [["doctor", "--json"]],
  images: [["images", "build"]],
  "images-ui": [["images", "build", "--ui"]],
  fixtures: [["fixtures", "build"], ["fixtures", "build", "--name", "demo-shop"]],
  "fixtures-force": [["fixtures", "build", "--force"], ["fixtures", "build", "--name", "demo-shop", "--force"]],
  stats: [["stats", "--json"]],
  "verify-log": [["verify-log", "--org", "{org}", "--json"]],
};

export const JOB_LINES = 200;
export const JobState = z.object({
  job: SystemJob,
  state: z.enum(["idle", "running", "ok", "failed"]),
  started_at: z.string().datetime().nullable(),
  finished_at: z.string().datetime().nullable(),
  exit: z.number().int().nullable(),
  /** the last lines of the output, without terminal escapes */
  lines: z.array(z.string().max(500)).max(JOB_LINES),
  /** the parsed JSON of a `--json` command (doctor, stats, verify-log) */
  result: z.unknown(),
}).strict();
export type JobState = z.infer<typeof JobState>;

/** Output lines for the web: \r and \n split, ANSI escapes and other control characters dropped, long lines cut. */
export function jobLines(chunk: string): string[] {
  const ESC = String.fromCharCode(27);
  let s = chunk.split(`${ESC}[`).map((part, i) => (i === 0 ? part : part.replace(/^[0-9;?]*[A-Za-z]/, ""))).join("");
  s = [...s].filter((c) => c === "\n" || c === "\r" || c === "\t" || c.charCodeAt(0) >= 32).join("");
  return s.split(/[\r\n]+/).map((l) => l.trimEnd()).filter((l) => l.trim() !== "").map((l) => (l.length > 500 ? `${l.slice(0, 499)}…` : l));
}

export const DoctorReport = z.object({ checks: z.array(z.object({ name: z.string(), ok: z.boolean(), detail: z.string() }).passthrough()), exit: z.number().int() }).passthrough();
export const StatsReport = z.object({
  total: z.number(),
  byResult: z.object({ VERIFIED: z.number(), UNKNOWN: z.number(), FAILED: z.number() }),
  unknownShare: z.number(),
  topReasons: z.array(z.object({ cls: z.string(), n: z.number() })),
  meanUsd: z.number(),
  meanMinutes: z.number(),
}).passthrough();
export const LedgerReport = z.object({ ok: z.boolean(), count: z.number().optional(), firstBadSeq: z.number().nullable().optional(), code: z.string().optional() }).passthrough();

/** D-388: "Add project" from the web — the folder of a git project on this computer (the control endpoint registers it). */
export const AddProjectBody = z.object({ path: LocalPath }).strict();
export type AddProjectBody = z.infer<typeof AddProjectBody>;
export const AddProjectReply = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), repo_id: z.string().uuid(), full_name: z.string().min(1).max(200), created: z.boolean() }).strict(),
  z.object({ ok: z.literal(false), error: z.enum(["not_a_folder", "not_git", "no_commits", "inside_home", "failed"]) }).strict(),
]);
export type AddProjectReply = z.infer<typeof AddProjectReply>;
