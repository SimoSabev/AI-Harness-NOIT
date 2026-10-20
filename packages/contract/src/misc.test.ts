import { describe, expect, it } from "vitest";
import {
  GatePolicySchema,
  GateRouteSchema,
  MandatError,
  RunId,
  Verdict,
  computeConfigHash,
  exitCodeOf,
  hashJcs,
  sha256Tag,
  ulid,
} from "./index.js";

describe("gate schemas", () => {
  const route = { id: "llm", method: "POST", match: { kind: "exact", path: "/v1/messages" }, upstream: "llm_proxy" };
  it("GatePolicySchema/GateRouteSchema", () => {
    expect(GateRouteSchema.parse(route)).toEqual(route);
    const p = { version: 1, run_id: "r_" + ulid(), phase: "agent", routes: [route] };
    expect(GatePolicySchema.parse(p)).toEqual(p);
    expect(() => GateRouteSchema.parse({ ...route, method: "PUT" })).toThrow();
    expect(() => GateRouteSchema.parse({ ...route, match: { kind: "exact", path: "v1/messages" } })).toThrow();
  });
});

describe("ulid", () => {
  it("26 знака Crockford, уникални, RunId", () => {
    const now = Date.now();
    const a = ulid(now);
    const b = ulid(now);
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(a).not.toBe(b);
    expect(a.slice(0, 10)).toBe(b.slice(0, 10));
    expect(() => RunId.parse("r_" + ulid())).not.toThrow();
    expect(ulid(0).slice(0, 10)).toBe("0000000000");
    expect(ulid(2 ** 48 - 1).slice(0, 10)).toBe("7ZZZZZZZZZ");
    expect(() => ulid(2 ** 48)).toThrow();
    expect(ulid(1_700_000_000_000) < ulid(1_700_000_000_001)).toBe(true);
  });
});

describe("errors", () => {
  it("exitCodeOf", () => {
    expect(exitCodeOf("E_USAGE")).toBe(2);
    expect(exitCodeOf("E_LOCKED")).toBe(2);
    expect(exitCodeOf("E_CONTRACT_HASH")).toBe(5);
    expect(exitCodeOf("E_CONTRACT_INVALID")).toBe(5);
    expect(exitCodeOf("E_MIRROR_MISSING")).toBe(3);
    expect(exitCodeOf("E_BASE_NOT_FOUND")).toBe(3);
  });
  it("MandatError носи code и details", () => {
    const e = new MandatError("E_DOCKER", "boom", { a: 1 });
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("E_DOCKER");
    expect(e.details).toEqual({ a: 1 });
    expect(e.name).toBe("MandatError");
    expect(new MandatError("E_DOCKER", "x").details).toBeUndefined();
  });
});

describe("hashes", () => {
  it("sha256Tag и hashJcs", () => {
    expect(sha256Tag("")).toBe("sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Tag(new Uint8Array([]))).toBe(sha256Tag(""));
    expect(hashJcs({ b: 1, a: 2 })).toBe(hashJcs({ a: 2, b: 1 }));
    expect(computeConfigHash).toBeTypeOf("function");
  });
});

describe("Verdict", () => {
  const timings = { provision: 0, install: 0, agent: 0, export: 0, verify: 0, verdict: 0, total: 0 };
  const v = {
    run_id: "r_" + ulid(),
    task_id: "t_fix_discount",
    attempt: 1,
    agent: "fake:honest-fix",
    result: "UNKNOWN",
    reasons: [],
    evidence: [],
    contract_hash: sha256Tag("c"),
    base_sha: "0".repeat(40),
    tree_sha: null,
    diff_hash: null,
    integrity: "n/a",
    usage: { usd: 0, input_tokens: 0, output_tokens: 0, requests: 0 },
    timings_ms: timings,
    created_at: new Date().toISOString(),
  };
  it("timings_ms изчерпателен (D-063)", () => {
    expect(() => Verdict.parse(v)).not.toThrow();
    const { verify: _v, ...partial } = timings;
    expect(() => Verdict.parse({ ...v, timings_ms: partial })).toThrow();
  });
});
