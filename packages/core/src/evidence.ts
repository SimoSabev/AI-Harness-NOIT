import type { DetectorId, Evidence } from "@mandat/contract";
import { signature } from "./signature.js";

const SOURCE: Record<DetectorId, Evidence["source"]> = {
  EXPORT: "export", CANARY: "export", INTEGRITY: "worker", "D10.lockfile": "worker", "D3.protected": "worker", "D4.contract": "worker",
  MUST_PASS: "worker", AGENT: "worker", INFRA: "worker", PLACEHOLDER: "worker", "D1.base_tests": "sandbox:verify", "D2.inventory": "sandbox:verify",
  "D7.ci": "github:observer", POLICY: "worker", "D11.mutation": "sandbox:verify",
  "D5.hidden": "sandbox:verify", "D8.static": "sandbox:verify", "D12.ui": "sandbox:verify", RESEARCH: "worker", REVIEW: "worker",
};

/** D-129 sources; signature only for fail/unknown. */
export function ev(detector: DetectorId, status: Evidence["status"], summary: string, data: Record<string, unknown> = {}, sig?: { cls: string; id: string }): Evidence {
  const e: Evidence = { detector, phase: 1, status, summary: summary.slice(0, 300), data, source: SOURCE[detector], agent_visible: true };
  if (sig && (status === "fail" || status === "unknown")) e.signature = signature(detector.split(".")[0] ?? detector, sig.cls, sig.id);
  return e;
}

export const na = (detector: DetectorId, why = "not run"): Evidence => ev(detector, "n/a", why);
