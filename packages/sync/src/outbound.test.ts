import { describe, expect, it } from "vitest";
import { MandatError, type SyncChange } from "@mandat/contract";
import { assertSafeOutbound } from "./outbound.js";
import { createVault, seal } from "./vault.js";

const ch = (kind: SyncChange["kind"], body: Record<string, unknown>): SyncChange => ({ kind, id: "x1", baseRev: 0, deleted: false, body });

describe("nothing secret leaves in clear (D-494)", () => {
  it("lets ordinary records through", () => {
    expect(() => assertSafeOutbound([ch("prefs", { lang: "bg", theme: "dark" }), ch("project", { name: "shop", repo: "https://github.com/a/b" })])).not.toThrow();
  });

  it.each([
    ["anthropic", "sk-ant-api03-TESTONLY-abcdefghijklmnopqrstuvwxyz"],
    ["openai", "sk-TESTONLYabcdefghijklmnopqrstuvwxyz012345"],
    ["github", "ghp_TESTONLY0123456789abcdefghijklmnopqrstu"],
  ])("refuses a %s key hidden in any record", (_k, key) => {
    expect(() => assertSafeOutbound([ch("connection", { name: "main", note: { deep: [key] } })])).toThrow(MandatError);
  });

  it("a secret record must be a sealed envelope, never a plain value", () => {
    const v = createVault("pass-pass-pass", { n: 1024, r: 8, p: 1 });
    const sealed = seal(v.key, "sk-ant-api03-TESTONLY-abcdefghijklmnopqrstuvwxyz", "secret/x1");
    expect(() => assertSafeOutbound([ch("secret", { label: "Anthropic", sealed })])).not.toThrow();
    expect(() => assertSafeOutbound([ch("secret", { label: "Anthropic", value: "anything" })])).toThrow(MandatError);
    expect(() => assertSafeOutbound([ch("secret", { label: "sk-ant-api03-TESTONLY-abcdefghijklmnopqrstuvwxyz", sealed })])).toThrow(MandatError);
  });

  it("a deleted secret may travel without a body", () => {
    expect(() => assertSafeOutbound([{ kind: "secret", id: "x1", baseRev: 2, deleted: true, body: {} }])).not.toThrow();
  });
});
