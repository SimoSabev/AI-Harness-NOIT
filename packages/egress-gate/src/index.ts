export { matchPolicy, matchTunnel } from "./policy.js";
export type { GateDecision } from "./policy.js";
// D-155: the lockfile allowlist lives in @mandat/contract (pure; also used by core D10).
export { npmAllowlistFromLockfile } from "@mandat/contract";
export type { NpmAllowlistResult } from "@mandat/contract";
export { buildDnsResponse, decideDns, parseDnsQuery } from "./dns.js";
export type { DnsAnswer, DnsQuestion } from "./dns.js";
export { startGate } from "./server.js";
export type { GateOptions } from "./server.js";
