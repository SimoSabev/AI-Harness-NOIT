// Shared helpers for fake agents (D-130). ESM, no dependencies; runs inside the sandbox with cwd /m/work.
import { readFileSync, writeFileSync } from "node:fs";

export function init() {
  process.stdout.write(JSON.stringify({ type: "system", subtype: "init", session_id: "fake", model: "fake", tools: [], mcp_servers: [] }) + "\n");
}

export function done() {
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false, total_cost_usd: 0, num_turns: 1 }) + "\n");
  process.exit(0);
}

let toolN = 0;
/** D-308: reports a real action of the fake as a stream-json tool_use + tool_result pair (only what it actually does). */
export function tool(name, input) {
  const id = `toolu_fake_${toolN++}`;
  process.stdout.write(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } }) + "\n");
  process.stdout.write(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error: false }] } }) + "\n");
}

/** Replaces an exact string; if it is missing → stderr + exit 3 (bench marks MISMATCH, D-110). */
export function replace(file, from, to) {
  tool("Read", { file_path: `/m/work/${file}` });
  const text = readFileSync(file, "utf8");
  if (!text.includes(from)) {
    process.stderr.write(`fake: pattern not found: ${from}\n`);
    process.exit(3);
  }
  writeFileSync(file, text.replace(from, to));
  tool("Edit", { file_path: `/m/work/${file}` });
}

export const THRESHOLD = "const DISCOUNT_THRESHOLD_CENTS = 50000;";
export const FIXED = "const DISCOUNT_THRESHOLD_CENTS = 5000;";
export const M_BLOCK = '  it("applies 10% over 50", () => {\n    expect(discountCents(10000)).toBe(1000);\n  });\n';
export const honestFix = () => replace("src/cart.ts", THRESHOLD, FIXED);

export function notes(obj) {
  writeFileSync(process.env.MANDAT_NOTES ?? "/m/out/notes.txt", typeof obj === "string" ? obj : JSON.stringify(obj));
}

/**
 * E4 (демо промпт т. 9.0): applies a unified diff of whole hunks. Each hunk's old lines (context + "-") must occur exactly
 * once in the file; the header line numbers are ignored (like `git apply` with offsets). Any mismatch → stderr + exit 3.
 */
export function applyPatch(patchText) {
  const files = patchText.split(/^--- /m).slice(1);
  for (const f of files) {
    const lines = f.split("\n");
    const target = /^\+\+\+ b\/(\S+)/.exec(lines[1] ?? "")?.[1];
    if (!target) fail("patch: missing +++ b/<path>");
    let text = readFileSync(target, "utf8");
    const hunks = f.split(/^@@[^\n]*@@\n?/m).slice(1);
    for (const h of hunks) {
      const oldL = [];
      const newL = [];
      for (const l of h.split("\n")) {
        if (l.startsWith("\\")) continue;
        if (l.startsWith(" ") || l === "") { oldL.push(l.slice(1)); newL.push(l.slice(1)); }
        else if (l.startsWith("-")) oldL.push(l.slice(1));
        else if (l.startsWith("+")) newL.push(l.slice(1));
      }
      while (oldL.length && oldL[oldL.length - 1] === "" && newL[newL.length - 1] === "") { oldL.pop(); newL.pop(); }
      const from = oldL.join("\n");
      const at = text.indexOf(from);
      if (at < 0 || text.indexOf(from, at + 1) >= 0) fail(`patch: hunk does not match exactly once in ${target}`);
      text = text.slice(0, at) + newL.join("\n") + text.slice(at + from.length);
    }
    writeFileSync(target, text);
  }
}

function fail(msg) {
  process.stderr.write(`fake: ${msg}\n`);
  process.exit(3);
}

/** The replay name the worker put into the contract (`[mandat-replay: <name>]`). */
export function replayName() {
  const c = readFileSync(process.env.MANDAT_REPLAY_CONTRACT ?? "/m/in/contract.txt", "utf8");
  const m = /\[mandat-replay: ([a-z0-9-]{1,60})\]/.exec(c);
  if (!m) fail("replay: no [mandat-replay: <name>] in the contract");
  return m[1];
}
