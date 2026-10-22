// В-1 / D-204 / D-238: which workspace package is core (Apache-2.0) and which is harness (GPL-3.0-or-later).
export const CORE_PACKAGES = Object.freeze([
  "@mandat/contract", "@mandat/core", "@mandat/ledger", "@mandat/export", "@mandat/sandbox", "@mandat/redaction",
  "@mandat/verify", "@mandat/gate-github", "@mandat/mcp",
]);
export const HARNESS_PACKAGES = Object.freeze([
  "@mandat/egress-gate", "@mandat/llm-proxy", "@mandat/channels", "@mandat/agents", "@mandat/cli", "@mandat/onboard", "@mandat/profile", "@mandat/mcp-bridge",
  "@mandat/worker", "@mandat/web", "@mandat/bench", "@mandat/desktop", "spikes", "mandat",
]);
/** @param {string} name @returns {"core"|"harness"|null} */
export function groupOf(name) {
  if (CORE_PACKAGES.includes(name)) return "core";
  if (HARNESS_PACKAGES.includes(name)) return "harness";
  return null;
}
