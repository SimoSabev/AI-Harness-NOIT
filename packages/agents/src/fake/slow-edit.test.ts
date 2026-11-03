import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.resolve(import.meta.dirname, "../../fakes/slow-edit.mjs");

function run(cart: string) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "mandat-slow-edit-"));
  mkdirSync(path.join(cwd, "src"));
  writeFileSync(path.join(cwd, "src/cart.ts"), cart);
  const r = spawnSync(process.execPath, [script], { cwd, encoding: "utf8", env: { ...process.env, FAKE_LINGER_MS: "0" } });
  return { status: r.status, cart: readFileSync(path.join(cwd, "src/cart.ts"), "utf8") };
}

// D-448: a non-zero exit is a failed agent now, so the fake that waited for another task's same edit must not crash on it
describe("fake:slow-edit", () => {
  it("makes the fix when the bug is there", () => {
    const r = run("const DISCOUNT_THRESHOLD_CENTS = 50000;\n");
    expect(r.status).toBe(0);
    expect(r.cart).toBe("const DISCOUNT_THRESHOLD_CENTS = 5000;\n");
  });

  it("an edit that is already in main is nothing to do: a clean end, no change", () => {
    const r = run("const DISCOUNT_THRESHOLD_CENTS = 5000;\n");
    expect(r.status).toBe(0);
    expect(r.cart).toBe("const DISCOUNT_THRESHOLD_CENTS = 5000;\n");
  });
});
