import { RESEARCH_ROLES } from "@mandat/contract";
import type { ResearchGoal, ResearchRole } from "@mandat/contract";

// E9г (D-393): which model does which role. Every channel the person connected counts — API keys, subscription
// profiles and local models. The score is the one of channel selection (D-0xx, packages/channels: 0.5·Q + 0.3·(1 − C)
// + 0.2·H) with the Q/C weights moved per role and goal: planning and writing pay for quality, the per-page roles
// (searcher, triage, reader) run many times and pay for cost. A subscription profile is slow per call (a CLI start),
// so the per-page roles prefer an API or a local model.

export interface RouterChannel {
  id: string;
  label: string;
  kind: "api_key" | "cli_profile" | "local" | "fake";
  model: string;
  enabled: boolean;
  health: "ok" | "degraded" | "down" | "limited";
  /** 0..1 */
  quality: number;
  /** 0..1, 1 = the most expensive */
  cost: number;
}
export interface RoleRoute {
  role: ResearchRole;
  /** first = the primary, the rest = fallbacks in order */
  channels: RouterChannel[];
  fixed: boolean;
}

const WQ: Record<ResearchGoal, Record<ResearchRole, number>> = {
  economy: { planner: 0.5, searcher: 0.2, triage: 0.2, reader: 0.2, analyst: 0.35, verifier: 0.35, writer: 0.5 },
  balanced: { planner: 0.7, searcher: 0.3, triage: 0.3, reader: 0.35, analyst: 0.5, verifier: 0.55, writer: 0.7 },
  quality: { planner: 0.8, searcher: 0.55, triage: 0.55, reader: 0.6, analyst: 0.75, verifier: 0.75, writer: 0.8 },
};
const PER_PAGE: ReadonlySet<ResearchRole> = new Set(["searcher", "triage", "reader"]);
const H: Record<RouterChannel["health"], number> = { ok: 1, degraded: 0.5, limited: 0, down: 0 };

export function roleScore(c: RouterChannel, role: ResearchRole, goal: ResearchGoal): number {
  const q = WQ[goal][role];
  const slow = c.kind === "cli_profile" && PER_PAGE.has(role) ? 0.15 : 0;
  return q * c.quality + (0.8 - q) * (1 - c.cost) + 0.2 * H[c.health] - slow;
}

export function routeRoles(channels: readonly RouterChannel[], goal: ResearchGoal, fixed: Partial<Record<ResearchRole, string>> = {}): { ok: true; routes: RoleRoute[] } | { ok: false; why: string } {
  const usable = channels.filter((c) => c.enabled && (c.health === "ok" || c.health === "degraded"));
  if (usable.length === 0) return { ok: false, why: "no usable model channel (all disabled, down or limited)" };
  const routes: RoleRoute[] = [];
  for (const role of RESEARCH_ROLES) {
    const ranked = [...usable].sort((a, b) => roleScore(b, role, goal) - roleScore(a, role, goal) || a.label.localeCompare(b.label));
    const want = fixed[role];
    if (want !== undefined) {
      const pin = usable.find((c) => c.id === want);
      if (!pin) return { ok: false, why: `the channel fixed for ${role} is not usable` };
      routes.push({ role, channels: [pin, ...ranked.filter((c) => c.id !== pin.id)], fixed: true });
    } else routes.push({ role, channels: ranked, fixed: false });
  }
  return { ok: true, routes };
}
