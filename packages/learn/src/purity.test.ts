import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// D-641: packages/learn is pure statistics — no I/O, no processes, no network; only the contract and the profile.
describe("packages/learn is pure", () => {
  it("imports only @mandat/contract, @mandat/profile and its own files", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
      const src = readFileSync(path.join(dir, f), "utf8");
      for (const m of src.matchAll(/from\s+"([^"]+)"/g)) expect([f, m[1]]).toSatisfy(([, s]: [string, string]) => s === "@mandat/contract" || s === "@mandat/profile" || s.startsWith("./"));
      expect(src).not.toMatch(/\b(process\.|fetch\(|require\()/);
    }
  });
});
