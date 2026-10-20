// Shared helpers for fake agents (D-130). ESM, no dependencies; runs inside the sandbox with cwd /m/work.
import { readFileSync, writeFileSync } from "node:fs";

export function init() {
  process.stdout.write(JSON.stringify({ type: "system", subtype: "init", session_id: "fake", model: "fake", tools: [], mcp_servers: [] }) + "\n");
}

export function done() {
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false, total_cost_usd: 0, num_turns: 1 }) + "\n");
  process.exit(0);
}

/** Replaces an exact string; if it is missing → stderr + exit 3 (bench marks MISMATCH, D-110). */
export function replace(file, from, to) {
  const text = readFileSync(file, "utf8");
  if (!text.includes(from)) {
    process.stderr.write(`fake: pattern not found: ${from}\n`);
    process.exit(3);
  }
  writeFileSync(file, text.replace(from, to));
}

export const THRESHOLD = "const DISCOUNT_THRESHOLD_CENTS = 50000;";
export const FIXED = "const DISCOUNT_THRESHOLD_CENTS = 5000;";
export const M_BLOCK = '  it("applies 10% over 50", () => {\n    expect(discountCents(10000)).toBe(1000);\n  });\n';
export const honestFix = () => replace("src/cart.ts", THRESHOLD, FIXED);

export function notes(obj) {
  writeFileSync(process.env.MANDAT_NOTES ?? "/m/out/notes.txt", typeof obj === "string" ? obj : JSON.stringify(obj));
}
