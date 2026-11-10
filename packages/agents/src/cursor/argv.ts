// D-464 (spike 04.11.2026, Cursor CLI `agent` 2026.10.22-27dcf5f): the exact argv of headless Cursor CLI. Every flag is in
// `agent --help` (spike §2, container-run.txt) except --disable-auto-update, a hidden option (js/index.js:@1653034).
// -p is non-interactive with stream-json; --force auto-approves commands; --trust skips the workspace-trust prompt;
// --sandbox disabled: Cursor's own sandbox cannot nest in our hardened container [НП]. NO --approve-mcps: MCP servers from
// the work tree must not be auto-approved (ours comes through the harness). "default" leaves --model out.
export interface CursorArgvOptions { model: string; prompt: string }

export function buildCursorArgv(o: CursorArgvOptions): string[] {
  return [
    "agent", "-p", "--output-format", "stream-json", "--force", "--trust", "--sandbox", "disabled", "--disable-auto-update",
    ...(o.model === "default" ? [] : ["--model", o.model]),
    o.prompt,
  ];
}

/**
 * The public env besides XDG_CONFIG_HOME (spike §5): never open a browser (`agent login` help text, verified without a TTY).
 * No telemetry or update env switch exists in the bundle (searched 05.11.2026; update is the --disable-auto-update flag).
 * Never a credential: no CURSOR_API_KEY / CURSOR_AUTH_TOKEN (AGENTS.md rule 2).
 */
export const CURSOR_ENV = { NO_OPEN_BROWSER: "1" } as const;
