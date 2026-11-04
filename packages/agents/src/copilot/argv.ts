// D-464 (spike 04.11.2026, @github/copilot 1.0.105): the exact argv of headless GitHub Copilot CLI. Every flag is from
// `copilot --help` (spike §2). `-p` is non-interactive; --allow-all-tools is "required for non-interactive mode" (the flag,
// not COPILOT_ALLOW_ALL=true, which would also trust the folder's hooks/MCP/skills). "default" leaves --model out.
export interface CopilotArgvOptions { model: string; prompt: string }

export function buildCopilotArgv(o: CopilotArgvOptions): string[] {
  return [
    "copilot", "-p", o.prompt, "--output-format", "json",
    ...(o.model === "default" ? [] : ["--model", o.model]),
    "--allow-all-tools", "--allow-all-paths", "--no-ask-user", "--no-auto-update", "--disable-client-telemetry", "--disable-builtin-mcps", "--no-color",
  ];
}

/** The public env besides COPILOT_HOME (spike §2): no auto-update, OpenTelemetry explicitly off. Never a credential. */
export const COPILOT_ENV = { COPILOT_AUTO_UPDATE: "false", COPILOT_OTEL_ENABLED: "false" } as const;

/**
 * What `$COPILOT_HOME/settings.json` must hold before `copilot login --device-code` (spike §4–5): without a keychain and a
 * TTY the token is not saved unless storeTokenPlaintext is true (`copilot config` refuses to set it). [НП: one real login]
 */
export const COPILOT_SETTINGS = { storeTokenPlaintext: true, banner: "never" } as const;
