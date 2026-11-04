// D-464 (spike 2026-11-04): the exact argv of headless Kimi Code CLI (@moonshot-ai/kimi-code 2.4.1). `-p` is print mode,
// which forces permission mode "auto" on its own; --yolo/--auto/--plan are rejected with -p, so none is passed. The model
// alias is `kimi-code/<id>` [НП: the concrete ids come from the server]; "default" leaves -m out (config.toml default_model).
export interface KimiArgvOptions { model: string; prompt: string }

export function buildKimiArgv(o: KimiArgvOptions): string[] {
  return ["kimi", "--output-format", "stream-json", ...(o.model === "default" ? [] : ["-m", o.model]), "-p", o.prompt];
}

/** The public env for Kimi besides KIMI_CODE_HOME: no telemetry, no auto-update (spike section 2). Never a secret. */
export const KIMI_ENV = { KIMI_DISABLE_TELEMETRY: "1", KIMI_CODE_NO_AUTO_UPDATE: "1" } as const;
