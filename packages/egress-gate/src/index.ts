export { matchPolicy } from "./policy.js";
export type { GateDecision } from "./policy.js";
export { npmAllowlistFromLockfile } from "./npm-allowlist.js";
export type { NpmAllowlistResult } from "./npm-allowlist.js";
export { buildDnsResponse, decideDns, parseDnsQuery } from "./dns.js";
export type { DnsAnswer, DnsQuestion } from "./dns.js";
export { startGate } from "./server.js";
export type { GateOptions } from "./server.js";
