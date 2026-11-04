// D-464 (spike 04.11.2026): the exact argv of headless MiniMax Code (@minimax-ai/code 0.7.4, bin `mcode`). `exec` with
// --permission full (= bypassPermissions; `ask` is rejected headless), the prompt is the positional argument and comes
// last (`mcode exec --help`). The model is `<provider>/<model>`; "default" leaves --model out (config.yaml's default,
// observed minimax/MiniMax-M3.1-Flash). The prompt is never `--`-guarded: the contract text starts with "#" [НП: a live run].
export interface MinimaxArgvOptions { model: string; prompt: string }

export function buildMinimaxArgv(o: MinimaxArgvOptions): string[] {
  return ["mcode", "exec", "--output-format", "stream-json", "--permission", "full", "--cwd", "/m/work", ...(o.model === "default" ? [] : ["--model", o.model]), o.prompt];
}

/**
 * The public env for mcode besides MINIMAX_DATA_DIR (the profile volume). Never a secret.
 * MCODE_DISABLE_EVAL_CAPTURE: stops the upload of agent steps to /mavis/api/v1/eval/steps/report (chunk-YYSTRBDA.js,
 * truthy = "1"/"true"/"yes"). Data contribution is config.yaml only and login/usage track() and the update check have no
 * env off-switch in the source [НП].
 */
export const MINIMAX_ENV = { MCODE_DISABLE_EVAL_CAPTURE: "1" } as const;
