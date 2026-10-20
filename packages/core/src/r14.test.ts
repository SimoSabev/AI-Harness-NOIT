import { describe, expect, it } from "vitest";
import type { GateLogLine } from "@mandat/contract";
import { evaluateR14 } from "./index.js";

const RUN = "r_01JB8Z3K4M5N6P7Q8R9S0T1V2W";
const ts = "2026-10-20T10:00:00.000Z";
const probe = (id: string, o: Partial<{ exit: number; http_code: string | null; dns_status: string | null; dns_answers: number | null }>) => ({
  id, cmd: id, exit: 0, http_code: null, dns_status: null, dns_answers: null, ...o,
});
const notes = (over: Record<string, ReturnType<typeof probe>> = {}) =>
  JSON.stringify({
    probes: [
      probe("p1", { exit: 7 }), probe("p2", { exit: 0, dns_status: "NXDOMAIN", dns_answers: 0 }), probe("p3", { exit: 7 }),
      probe("p4", { exit: 7 }), probe("p5", { exit: 1 }), probe("p6", { exit: 56, http_code: "403" }),
      probe("p7", { http_code: "403" }), probe("p8", { http_code: "403" }),
    ].map((p) => over[p.id] ?? p),
  });
const log: GateLogLine[] = [
  { ts, run_id: RUN, kind: "dns_block", qname: "evil.example", qtype: 1 },
  { ts, run_id: RUN, kind: "proxy_block", method: "CONNECT", path: "example.com:443", status: 403 },
  { ts, run_id: RUN, kind: "proxy_block", method: "PUT", path: "/npm/left-pad", status: 403 },
  { ts, run_id: RUN, kind: "proxy_block", method: "GET", path: "/v1/models", status: 403 },
];

describe("evaluateR14 (D-073)", () => {
  it("8/8; липсващ лог за p8; hosts_only; невалидни notes; p1 exit 0", () => {
    expect(evaluateR14(notes(), log, { dnsMode: "gate" }).blocked).toBe(8);
    const no8 = evaluateR14(notes(), log.slice(0, 3), { dnsMode: "gate" });
    expect(no8.blocked).toBe(7);
    expect(no8.probes.find((p) => p.id === "p8")?.blocked).toBe(false);
    const noDns = log.slice(1);
    expect(evaluateR14(notes(), noDns, { dnsMode: "gate" }).probes.find((p) => p.id === "p2")?.blocked).toBe(false);
    expect(evaluateR14(notes(), noDns, { dnsMode: "hosts_only" }).probes.find((p) => p.id === "p2")?.blocked).toBe(true);
    const bad = evaluateR14("not json", log, { dnsMode: "gate" });
    expect(bad.blocked).toBe(0);
    expect(bad.probes.every((p) => p.why === "notes_invalid")).toBe(true);
    expect(evaluateR14(notes({ p1: probe("p1", { exit: 0 }) }), log, { dnsMode: "gate" }).probes[0]?.blocked).toBe(false);
    expect(evaluateR14(notes({ p2: probe("p2", { dns_answers: 1 }) }), log, { dnsMode: "gate" }).probes[1]?.blocked).toBe(false);
    expect(evaluateR14(notes({ p6: probe("p6", { exit: 0, http_code: "200" }) }), log, { dnsMode: "gate" }).probes[5]?.blocked).toBe(false);
    expect(evaluateR14(notes({ p7: probe("p7", { http_code: "200" }) }), log, { dnsMode: "gate" }).probes[6]?.blocked).toBe(false);
    expect(evaluateR14(JSON.stringify({ probes: "x" }), log, { dnsMode: "gate" }).blocked).toBe(0);
  });
});
