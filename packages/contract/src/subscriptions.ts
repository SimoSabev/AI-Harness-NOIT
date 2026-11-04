import { z } from "zod";
import { ProviderId } from "./connections.js";
import { GateTunnelSchema } from "./gate.js";
import { AgentCli } from "./agent-cli.js";

// D-460: the subscription providers in one place. A subscription is the unmodified vendor CLI with its own login (D-295):
// the person signs in once through the vendor's flow, the login lives in a profile volume that only the agent container
// mounts at `configDir`, and the sandbox reaches the vendor only through the gate's CONNECT tunnels below. The harness
// never reads the login; it runs only the `status` command and keeps whether it says "signed in" (plus email and plan).
// One entry per provider: the sandbox (buildProfileArgs), the channels (tunnels), the CLI (accounts, login) and the web
// (Settings → Subscriptions, the task box) all read this table. Sources and dates: docs/integrations/subscriptions.md.

/** No dash: a profile volume `mandat-profile-<id>-<name>` maps back to exactly one provider. D-464: = the agent CLIs. */
export const SubscriptionId = AgentCli;
export type SubscriptionId = AgentCli;

/** paste_code: the CLI prints the vendor's page, the person pastes a code back (Claude). device_code: the CLI prints a page
 * and a one-time code the person types there (Codex, GitHub). browser_callback: a redirect to localhost — does not work from
 * a container without more plumbing. */
export const LoginMethod = z.enum(["paste_code", "device_code", "browser_callback"]);
export type LoginMethod = z.infer<typeof LoginMethod>;

/** ready: run live; untested: wired end to end, [НП] a live run; blocked: wired, the terms say no or are unclear;
 * planned: the CLI is not in the sandbox image or has no adapter yet (a spike, docs/integrations/subscriptions.md). */
export const Availability = z.enum(["ready", "untested", "blocked", "planned"]);
export type Availability = z.infer<typeof Availability>;

const Argv = z.array(z.string().regex(/^[A-Za-z0-9=._-]+$/)).max(6);
const Host = z.string().regex(/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/);

export const SubscriptionProvider = z.object({
  id: SubscriptionId,
  /** the product name, never translated */
  label: z.string().min(1).max(40),
  vendor: z.string().min(1).max(40),
  /** the plans that sign in, as the vendor names them */
  plans: z.string().min(1).max(80),
  cli: z.object({ bin: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/), npm: z.string().max(80), version: z.string().max(40).nullable(), license: z.string().max(40) }).strict(),
  /** the non-interactive form the adapter uses (documentation; the adapter owns the real argv) */
  headless: z.string().max(80),
  login: z.object({ method: LoginMethod, argv: Argv, /** the vendor pages the person may be sent to */ hosts: z.array(Host).max(6) }).strict(),
  /** `format` = how packages/cli reads the answer: only "signed in?", the email and the plan, never a token */
  /** D-464: a file the harness writes into the fresh profile volume before the first sign-in (settings the CLI needs to
   * keep the login in a file, or privacy settings); plain settings only, never a credential */
  seed: z.object({ file: z.string().regex(/^[a-z][a-z0-9-]{0,30}\.(json|yaml|toml)$/), text: z.string().regex(/^[A-Za-z0-9 {}":,_.\n-]{1,400}$/) }).strict().optional(),
  status: z.object({ /** D-464: a probe of the image instead of the CLI itself (on PATH, no slash) */ bin: z.string().regex(/^[a-z][a-z0-9-]{0,40}$/).optional(), argv: Argv, format: z.enum(["claude-json", "codex-text", "exit-code", "match"]), /** D-464: format "match" = exit 0 and this text in stdout */ match: z.string().regex(/^[A-Za-z0-9:._@" -]{1,60}$/).optional() }).strict(),
  logout: Argv,
  /** the login's home in the agent container (the profile volume is mounted here) and the variable that points the CLI at it */
  configDir: z.string().regex(/^\/home\/agent\/\.[a-z0-9-]+$/),
  configEnv: z.string().regex(/^[A-Z][A-Z0-9_]{0,40}$/),
  /** more env for login/status/logout (never a secret) */
  env: z.record(z.string().regex(/^[A-Z][A-Z0-9_]{0,40}$/), z.string().max(100)),
  /** the CONNECT tunnels the sandbox gets for this subscription (TLS end to end; the gate allows nothing else) */
  tunnels: z.array(GateTunnelSchema).max(8),
  /** the adapter in packages/agents that runs it; null = none yet */
  agent: AgentCli.nullable(),
  /** D-464: the model of an account without saved models; "default" = no model flag, the CLI's (and the plan's) own choice */
  defaultModel: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/),
  /** the connections catalog entry its models come from (Settings → Models); null = none yet */
  connectionProvider: ProviderId.nullable(),
  terms: z.object({ harness: z.enum(["allowed", "unclear", "forbidden"]), url: z.string().url(), note: z.string().max(300) }).strict(),
  availability: Availability,
  docs: z.string().url(),
  checked: z.string().regex(/^\d{4}-\d\d-\d\d$/),
}).strict();
export type SubscriptionProvider = z.infer<typeof SubscriptionProvider>;

const t443 = (...hosts: string[]) => hosts.map((host) => ({ host, port: 443 }));
const PLANNED = { status: { argv: [], format: "exit-code" as const }, logout: [], env: {}, tunnels: [], agent: null, connectionProvider: null, defaultModel: "default", availability: "planned" as const };

export const SUBSCRIPTIONS: Readonly<Record<SubscriptionId, SubscriptionProvider>> = {
  // D-295, D-369: `claude auth login --claudeai` prints claude.ai's authorize page; the person pastes the code back
  claude: {
    id: "claude", label: "Claude", vendor: "Anthropic", plans: "Pro · Max · Team · Enterprise",
    cli: { bin: "claude", npm: "@anthropic-ai/claude-code", version: null, license: "proprietary" }, headless: "claude -p --output-format stream-json",
    login: { method: "paste_code", argv: ["auth", "login", "--claudeai"], hosts: ["claude.com", "claude.ai", "platform.claude.com", "console.anthropic.com"] },
    status: { argv: ["auth", "status", "--json"], format: "claude-json" }, logout: ["auth", "logout"],
    configDir: "/home/agent/.claude-profile", configEnv: "CLAUDE_CONFIG_DIR", env: { DISABLE_AUTOUPDATER: "1" },
    tunnels: t443("api.anthropic.com", "console.anthropic.com", "platform.claude.com"),
    agent: "claude", connectionProvider: "claude-sub", defaultModel: "claude-sonnet-5-5",
    terms: { harness: "allowed", url: "https://code.claude.com/docs/en/legal-and-compliance", note: "allows a person to sign in to the unmodified Claude Code binary, also on a platform that hosts it; no token handling, no reselling (D-295)" },
    availability: "ready", docs: "https://code.claude.com/docs/en/authentication", checked: "2026-11-04",
  },
  // D-392, D-426: `codex login --device-auth` — OpenAI's page and a one-time code; tunnels from the Codex source
  codex: {
    id: "codex", label: "ChatGPT", vendor: "OpenAI", plans: "Plus · Pro · Business · Edu · Enterprise",
    cli: { bin: "codex", npm: "@openai/codex", version: "0.160.1", license: "Apache-2.0" } /* in the image; 0.166.0 is out */, headless: "codex exec --json",
    login: { method: "device_code", argv: ["login", "--device-auth"], hosts: ["auth.openai.com", "chatgpt.com"] },
    status: { argv: ["login", "status"], format: "codex-text" }, logout: ["logout"],
    configDir: "/home/agent/.codex-profile", configEnv: "CODEX_HOME", env: {},
    tunnels: t443("chatgpt.com", "auth.openai.com"),
    agent: "codex", connectionProvider: "chatgpt-sub", defaultModel: "gpt-5-codex",
    terms: { harness: "allowed", url: "https://learn.chatgpt.com/docs/auth", note: "ChatGPT plans include Codex CLI; device-code sign-in must first be turned on in ChatGPT security settings" },
    availability: "untested", docs: "https://learn.chatgpt.com/docs/auth", checked: "2026-11-04",
  },
  // D-425: Google login (oauth-personal) in GEMINI_CLI_HOME; the CLI refuses a headless sign-in (exit 41) [НП]; Q-073
  gemini: {
    id: "gemini", label: "Gemini", vendor: "Google", plans: "Code Assist Standard · Enterprise",
    cli: { bin: "gemini", npm: "@google/gemini-cli", version: "0.65.0", license: "Apache-2.0" }, headless: "gemini -p --output-format stream-json",
    login: { method: "browser_callback", argv: [], hosts: ["accounts.google.com"] },
    status: { argv: [], format: "exit-code" }, logout: [],
    configDir: "/home/agent/.gemini-profile", configEnv: "GEMINI_CLI_HOME", env: {},
    tunnels: t443("cloudcode-pa.googleapis.com", "oauth2.googleapis.com", "www.googleapis.com"),
    agent: "gemini", connectionProvider: null, defaultModel: "default",
    // since 18.06.2026 personal plans (free, AI Pro, Ultra) are served by Antigravity CLI; Gemini CLI signs in only Code
    // Assist Standard/Enterprise (README and developers.googleblog.com, read 04.11.2026)
    terms: { harness: "unclear", url: "https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/tos-privacy.md", note: "personal plans moved to Antigravity on 18.06.2026; Code Assist OAuth through third-party software violates the terms; the unmodified CLI in a wrapper is not addressed (Q-073)" },
    availability: "blocked", docs: "https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/authentication.md", checked: "2026-11-04",
  },
  // planned (no adapter, not in the image): spike notes in docs/integrations/subscriptions.md (D-463). Qwen Code is not
  // here: its free Qwen OAuth ended 15.04.2026 and the Coding Plan is an API key (Settings → Keys), not a login.
  copilot: {
    id: "copilot", label: "GitHub Copilot", vendor: "GitHub", plans: "Copilot Free · Pro · Pro+ · Business · Enterprise",
    cli: { bin: "copilot", npm: "@github/copilot", version: "1.0.105", license: "proprietary" }, headless: "copilot -p --allow-all-tools --output-format json",
    login: { method: "device_code", argv: [], hosts: ["github.com"] },
    configDir: "/home/agent/.copilot-profile", configEnv: "COPILOT_HOME", ...PLANNED,
    terms: { harness: "allowed", url: "https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli", note: "GitHub documents Copilot CLI in CI and containers; every prompt uses premium requests" },
    docs: "https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli", checked: "2026-11-04",
  },
  // D-464 (spike 04.11.2026, scratchpad spikes/kimi.md → docs/integrations/subscriptions.md): RFC 8628 device code; the
  // login is a file under KIMI_CODE_HOME (no keyring); no status/logout subcommand in 2.4.1, so status = its provider list
  // naming managed:kimi-code (config only, not the token) and logout = removing the volume. 2.5.0 is younger than 3 days.
  kimi: {
    id: "kimi", label: "Kimi Code", vendor: "Moonshot AI", plans: "Kimi Code membership",
    cli: { bin: "kimi", npm: "@moonshot-ai/kimi-code", version: "2.4.1", license: "MIT" }, headless: "kimi -p --output-format stream-json",
    login: { method: "device_code", argv: ["login", "--region", "global"], hosts: ["www.kimi.ai", "www.kimi.com"] },
    status: { argv: ["provider", "list", "--json"], format: "match", match: "managed:kimi-code" }, logout: [],
    configDir: "/home/agent/.kimi-profile", configEnv: "KIMI_CODE_HOME", env: { KIMI_DISABLE_TELEMETRY: "1", KIMI_CODE_NO_AUTO_UPDATE: "1" },
    tunnels: t443("auth.kimi.ai", "api.kimi.ai"),
    agent: "kimi", connectionProvider: null, defaultModel: "default",
    terms: { harness: "unclear", url: "https://www.kimi.com/code/docs/kimi-code/community-guidelines.html", note: "the guidelines limit the membership to personal interactive use and call batch scripts beyond normal use; run one task at a time that a person started" },
    availability: "untested", docs: "https://moonshotai.github.io/kimi-code/en/reference/kimi-command", checked: "2026-11-04",
  },
  antigravity: {
    id: "antigravity", label: "Antigravity", vendor: "Google", plans: "Google AI Pro · Ultra · free",
    cli: { bin: "agy", npm: "(install script)", version: null, license: "proprietary" }, headless: "agy -p --output-format stream-json",
    login: { method: "paste_code", argv: [], hosts: ["accounts.google.com"] },
    configDir: "/home/agent/.antigravity-profile", configEnv: "HOME", ...PLANNED,
    terms: { harness: "unclear", url: "https://discuss.ai.google.dev/t/is-external-orchestration-of-antigravity-cli-headless-mode-supported-with-account-based-usage/183051", note: "the successor of Gemini CLI for personal plans since 18.06.2026; Google's answers on wrapping it on consumer plans conflict; tokens in the OS keyring" },
    docs: "https://antigravity.google/docs/cli/reference", checked: "2026-11-04",
  },
  cursor: {
    id: "cursor", label: "Cursor", vendor: "Anysphere", plans: "Cursor Pro · Ultra · Teams",
    cli: { bin: "agent", npm: "(install script)", version: null, license: "proprietary" }, headless: "agent -p --output-format stream-json",
    login: { method: "browser_callback", argv: [], hosts: ["cursor.com"] },
    configDir: "/home/agent/.cursor-profile", configEnv: "XDG_CONFIG_HOME", ...PLANNED,
    terms: { harness: "unclear", url: "https://cursor.com/terms-of-service", note: "[НП] whether the sign-in finishes without a localhost callback, and the terms for use through another tool" },
    docs: "https://cursor.com/docs/cli/reference/authentication", checked: "2026-11-04",
  },
  // D-464 (spike 04.11.2026): the M Plan login is a device code with PKCE (account.minimax.io, region global — the CLI's
  // default is cn); the login is a file under MINIMAX_DATA_DIR (no keyring). No status command: `mcode login` says
  // "Already signed in" when it is [НП: offline, read-only]. Data contribution is on by default and only config.yaml turns
  // it off, so that file is the seed; the eval-step upload has its own switch.
  minimax: {
    id: "minimax", label: "MiniMax Code", vendor: "MiniMax", plans: "M Plan",
    cli: { bin: "mcode", npm: "@minimax-ai/code", version: "0.7.4", license: "MIT" }, headless: "mcode exec --output-format stream-json",
    login: { method: "device_code", argv: ["login", "--region", "global", "--no-browser"], hosts: ["account.minimax.io"] },
    seed: { file: "config.yaml", text: "dataContribution:\n  enabled: false\n" },
    status: { argv: ["login", "--region", "global", "--no-browser"], format: "match", match: "Already signed in" }, logout: ["logout", "--region", "global"],
    configDir: "/home/agent/.minimax-profile", configEnv: "MINIMAX_DATA_DIR", env: { MCODE_DISABLE_EVAL_CAPTURE: "1", MAVIS_REGION: "en" },
    tunnels: t443("account.minimax.io", "agent.minimax.io"),
    agent: "minimax", connectionProvider: null, defaultModel: "default",
    terms: { harness: "unclear", url: "https://platform.minimax.io/docs/m-plan/faq.md", note: "the README shows headless use in scripts and CI; the M Plan FAQ calls the plan individual, interactive developer use and points production at pay-as-you-go" },
    availability: "untested", docs: "https://agent.minimax.io/docs/cli/quick-start.md", checked: "2026-11-04",
  },
};

export const subscriptionOf = (id: SubscriptionId): SubscriptionProvider => SUBSCRIPTIONS[id];

/** A sign-in runs only where the sandbox can run the CLI afterwards and the terms are not against it (D-460). */
export function canSignIn(id: SubscriptionId): boolean {
  const p = SUBSCRIPTIONS[id];
  return (p.availability === "ready" || p.availability === "untested") && p.agent !== null && p.terms.harness !== "forbidden";
}
export const LOGIN_CLIS: readonly SubscriptionId[] = SubscriptionId.options.filter(canSignIn);
/** The CLIs a sign-in can start (`mandat login --agent`, POST /accounts/login). */
export const LoginCliId = SubscriptionId.refine(canSignIn, "this subscription cannot be signed in yet");

const NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const PROFILE_VOLUME_PREFIX = "mandat-profile-";
/** The profile volume of an account (D-295): mandat-profile-<provider>-<name>. */
export function profileVolumeName(id: SubscriptionId, name: string): string {
  if (!NAME.test(name)) throw new Error("profile name: a-z, 0-9, '-', up to 32");
  return `${PROFILE_VOLUME_PREFIX}${SubscriptionId.parse(id)}-${name}`;
}
export function parseProfileVolume(volume: string): { id: SubscriptionId; name: string } | null {
  const m = /^mandat-profile-([a-z]+)-([a-z0-9][a-z0-9-]{0,31})$/.exec(volume);
  const id = SubscriptionId.safeParse(m?.[1]);
  return m?.[2] && id.success ? { id: id.data, name: m[2] } : null;
}

/** An https page of the provider's own sign-in hosts, no user info or port (what the web may show as a link). */
export function isSubscriptionLoginHost(id: SubscriptionId, u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === "https:" && p.username === "" && p.password === "" && p.port === "" && SUBSCRIPTIONS[id].login.hosts.includes(p.hostname);
  } catch {
    return false;
  }
}

/** D-461: what a card in Settings → Subscriptions says. A profile volume survives only a finished sign-in, so a volume
 * whose status no longer says "signed in" is an expired login (sign in again), not a new one. */
export const SubscriptionStatus = z.enum(["signed_in", "expired", "no_cli", "unavailable"]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;
export function subscriptionStatus(id: SubscriptionId, o: { loggedIn: boolean; imageMissing?: boolean }): SubscriptionStatus {
  const p = SUBSCRIPTIONS[id];
  if (p.availability === "planned" || o.imageMissing === true) return "no_cli";
  if (!canSignIn(id) || p.availability === "blocked") return "unavailable";
  return o.loggedIn ? "signed_in" : "expired";
}
