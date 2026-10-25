import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toml = readFileSync(path.join(repo, ".gitleaks.toml"), "utf8");

// D-095 + D-291: default rules; allowlist = the redaction corpus path and two exact, anchored, public false positives.
describe(".gitleaks.toml (D-095, D-291)", () => {
  it("default rules, one path, only anchored exact regexes on the secret", () => {
    expect(toml).toMatch(/\[extend\]\s*\nuseDefault = true/);
    expect([...toml.matchAll(/^paths = (.*)$/gm)].map((m) => m[1])).toEqual(["['''^fixtures/redaction/''']"]);
    const regexes = [...toml.matchAll(/'''(.*?)'''/g)].map((m) => m[1]).filter((r) => r !== "^fixtures/redaction/");
    expect(regexes).toEqual(["^dGhlIHNhbXBsZSBub25jZQ==$", "^excluded\\.secret_b32$", "^tvly-secret-123$"]);
    for (const r of regexes) expect(r).toMatch(/^\^[^*+?]*\$$/);
    expect(toml).toMatch(/regexTarget = "secret"/);
  });
  it("the RFC 6455 sample key is the documented nonce, not a credential", () => {
    expect(Buffer.from("dGhlIHNhbXBsZSBub25jZQ==", "base64").toString("utf8")).toBe("the sample nonce");
  });
});
