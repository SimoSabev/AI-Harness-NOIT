// Shared by lint-changed / typecheck-changed: run the profile's command (approved by a human) after an edit; the output
// goes back to the agent as additionalContext. Advisory: always exit 0; never runs a file name with shell characters.
import { spawnSync } from "node:child_process";
import { loadPolicy, readStdin } from "./_policy.mjs";

const EDITS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit", "apply_patch"]);
const SAFE = /^[A-Za-z0-9._/@+-]{1,256}$/;

export async function runChanged(kind) {
  try {
    const input = JSON.parse(await readStdin());
    const name = String(input?.tool_name ?? "");
    if (!EDITS.has(name)) return;
    const cmd = loadPolicy().commands?.[kind];
    if (typeof cmd !== "string" || cmd.length === 0) return;
    let file = String(input?.tool_input?.file_path ?? input?.tool_input?.path ?? "");
    if (file.startsWith("/m/work/")) file = file.slice(8);
    if (cmd.includes("{files}") && !SAFE.test(file)) return;
    const r = spawnSync("sh", ["-c", cmd.replaceAll("{files}", file)], { encoding: "utf8", timeout: 120_000, maxBuffer: 1 << 20 });
    const text = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().slice(-4000);
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: `${kind} (${r.status === 0 ? "ok" : `exit ${r.status}`}): ${text}` } }) + "\n");
  } catch {
    // advisory only
  }
}
