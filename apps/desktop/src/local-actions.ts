import { MandatApplyJson } from "@mandat/contract";
import type { DesktopResult, DesktopValue, EditorKind } from "@mandat/contract";

// E9g A3 (D-373): the two local edits, built from paths that local-access.ts already authorized.
// "Open in editor": vscode:// (documented: code.visualstudio.com/docs/configure/command-line, "Opening VS Code with URLs",
// read 24.10.2026), cursor:// and zed:// with the same file/<path>:<line> form (not verified yet, D-373).
// "Apply locally": `mandat --json apply --task <id> --repo <path>` (packages/cli, D-356) — merge --ff-only, it never
// resets, checks out -f or overwrites the person's changes; a refusal comes back with the CLI's reason.

const enc = (segment: string) => encodeURIComponent(segment);

export function editorUrl(editor: EditorKind, file: string, line: number | undefined, platform: NodeJS.Platform): string {
  const parts = (platform === "win32" ? file.replace(/\\/g, "/") : file).split("/");
  const encoded = parts.map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s) ? s : enc(s))).join("/");
  const p = encoded.startsWith("/") ? encoded : `/${encoded}`;
  return `${editor}://file${p}${line === undefined ? "" : `:${line}`}`;
}

/** The last check before shell.openExternal: one of the three schemes, the file form, nothing else. */
export function isEditorUrl(url: string): boolean {
  return /^(vscode|cursor|zed):\/\/file\/[^\s]+$/.test(url);
}

export function applyArgv(cliMain: string, taskId: string, repo: string): string[] {
  return [cliMain, "--json", "apply", "--task", taskId, "--repo", repo];
}

type ApplyValue = DesktopValue<"applyLocal">;

/** The CLI's exit code and stdout → the bridge's answer. Its last JSON line decides; it must agree with the exit code. */
export function applyValue(code: number, stdout: string): DesktopResult<ApplyValue> {
  const failed = (): DesktopResult<ApplyValue> => ({ ok: false, error: { code: "failed", message: `mandat apply did not answer (exit ${code})` } });
  const line = stdout.trim().split("\n").reverse().find((l) => l.trim().startsWith("{"));
  if (!line) return failed();
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return failed();
  }
  const r = MandatApplyJson.safeParse(raw);
  if (!r.success) return failed();
  const out = r.data;
  if (out.ok) return code === 0 ? { ok: true, value: { status: out.files.length === 0 ? "up_to_date" : "applied", head: out.head } } : failed();
  if (code === 0) return failed();
  return { ok: true, value: { status: "refused", head: null, detail: out.detail ? `${out.reason}: ${out.detail}`.slice(0, 2000) : out.reason } };
}
