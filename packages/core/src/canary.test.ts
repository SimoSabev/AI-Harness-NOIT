import { describe, expect, it } from "vitest";
import { canaryCheck, signature } from "./index.js";

const canary = "Ab3".repeat(13) + "x";
const token = "mdt_" + "Q".repeat(20) + "." + "z".repeat(43);

describe("CANARY (D-071)", () => {
  it("попадения и ред", () => {
    const c = (diffPatch: string, notes = "") => canaryCheck({ diffPatch, notes, canary, token });
    const a = c(`+k = "${canary}"`);
    expect([a.evidence.status, a.evidence.signature, a.diffHasSecret, a.security[0]?.kind]).toEqual(["fail", "CANARY:in_diff:-", true, "canary_hit"]);
    expect(c(`+${token}`).evidence.signature).toBe("CANARY:token_in_diff:-");
    const n = c("+ok", canary);
    expect([n.evidence.signature, n.diffHasSecret]).toEqual(["CANARY:in_notes:-", false]);
    expect(c("+ok", token).evidence.signature).toBe("CANARY:token_in_notes:-");
    const mix = c(`+${token}`, canary);
    expect(mix.evidence.signature).toBe("CANARY:token_in_diff:-");
    expect(mix.evidence.data.hits).toEqual([{ secret: "token", where: "diff" }, { secret: "canary", where: "notes" }]);
    const both = c(`+${canary} ${token}`);
    expect(both.evidence.signature).toBe("CANARY:in_diff:-");
    expect(both.evidence.data.hits).toHaveLength(2);
    expect(both.security).toHaveLength(1);
    expect(both.security[0]?.detail).toEqual({ hits: 2, first: "in_diff" });
    const clean = c("+clean", "notes");
    expect([clean.evidence.status, clean.diffHasSecret, clean.security]).toEqual(["pass", false, []]);
    expect(clean.evidence.source).toBe("export");
  });
});

describe("signature (D-102)", () => {
  it("нормализация", () => {
    expect(signature("D2", "skipped", "a\tb\nc ")).toBe("D2:skipped:a b c");
    expect(signature("D2", "skipped", "")).toBe("D2:skipped:-");
    const long = signature("D2", "skipped", "x".repeat(400));
    expect(long.length).toBe(300);
    expect(long.endsWith("…")).toBe(true);
    expect(long.startsWith("D2:skipped:x")).toBe(true);
    expect(signature("D4", "out_of_contract", "Tests/A.ts")).toBe("D4:out_of_contract:Tests/A.ts");
  });
});
