// E9в (spec 5.3, D-423): the exact argv of headless Gemini CLI (@google/gemini-cli 0.65.0; spike SG, docs/decisions.md D-423).
// `-p` forces headless mode; stream-json is one JSON event per line; yolo approves every tool inside the sandbox (the sandbox
// and the gate are the boundary; the compiled policies — `--policy <dir>` — still deny, and headless turns ask_user into deny).
// `--skip-trust` trusts /m/work for this session only. The contract goes into the prompt, never through GEMINI.md.
export interface GeminiArgvOptions { model: string; prompt: string }

export function buildGeminiArgv(o: GeminiArgvOptions): string[] {
  return ["gemini", "--output-format", "stream-json", "--approval-mode", "yolo", "--skip-trust", "-m", o.model, "-p", o.prompt];
}

/** D-428: GEMINI_CLI_HOME = the sandbox tmpfs home (the CLI keeps .gemini under it); a login profile would mount its volume here. */
export const GEMINI_HOME = "/home/agent";
export const GEMINI_HARNESS_DIR = "/m/in/harness/gemini";

/**
 * The system settings file (GEMINI_CLI_SYSTEM_SETTINGS_PATH; overrides user and project settings). The auth type is named
 * because GOOGLE_GEMINI_BASE_URL alone selects `gateway`, which headless validation refuses (exit 41) [НП: live].
 * No usage statistics (they add an installation id header), no update checks, no telemetry, no dotenv file from the work tree
 * (AGENTS.md rule 4) [НП: `advanced.ignoreLocalEnv` semantics].
 */
export const GEMINI_SYSTEM_SETTINGS = {
  security: { auth: { selectedType: "gemini-api-key" } },
  privacy: { usageStatisticsEnabled: false },
  general: { enableAutoUpdate: false, enableAutoUpdateNotification: false },
  telemetry: { enabled: false },
  advanced: { ignoreLocalEnv: true },
  // D-431: a repo's own .gemini/settings.json hooks never run; the harness instructions (/m/in/harness/instructions.md,
  // through --include-directories) are the only context file — the repo's GEMINI.md is not read [НП: live, a real model]
  hooksConfig: { enabled: false },
  context: { fileName: ["instructions.md"] },
} as const;
/** A Google login profile: the same, with the CLI's own login (oauth_creds.json in the profile volume, D-295). */
export const GEMINI_LOGIN_SETTINGS = { ...GEMINI_SYSTEM_SETTINGS, security: { auth: { selectedType: "oauth-personal" } } } as const;
