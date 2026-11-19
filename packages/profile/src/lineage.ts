// D-551 (М3 Х9, docs/prd/heavy-process.md §9 „архив с родословие“): a profile's versions form a chain through parent_id;
// this reads it back from a version to the first one, with what made each step (the change, the failure class, how many
// tasks, the bench before and after, the held-out counts). Pure: the rows come from the caller; bad rows are skipped.

export interface LineageVersion { id: string; version: number; parent_id: string | null; origin: "person" | "evolve" | "evolve_rollback" | "ablation" | null; trial_id: string | null; status: string; profile_hash: string }
export interface LineageTrial { id: string; manifest: unknown; status: string; bench: unknown; why: string | null }
export interface LineageStep {
  version: number; origin: LineageVersion["origin"]; status: string; profile_hash: string;
  change: string | null; detail: string | null; reason_class: string | null; evidence: number; trial_status: string | null; why: string | null;
  bench: { before: string; after: string; heldout_before: string | null; heldout_after: string | null } | null;
}

const MAX_STEPS = 200;
const obj = (x: unknown): Record<string, unknown> | null => (x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const str = (x: unknown): string | null => (typeof x === "string" ? x : null);
function count(x: unknown): string | null {
  const s = obj(x);
  return s && typeof s.pass === "number" && typeof s.total === "number" ? `${s.pass}/${s.total}` : null;
}

function benchOf(raw: unknown): LineageStep["bench"] {
  const b = obj(raw);
  const before = count(b?.before);
  const after = count(b?.after);
  if (!before || !after) return null;
  return { before, after, heldout_before: count(obj(b?.before)?.heldout), heldout_after: count(obj(b?.after)?.heldout) };
}

export function lineage(from: string, versions: readonly LineageVersion[], trials: readonly LineageTrial[]): LineageStep[] {
  const byId = new Map(versions.map((x) => [x.id, x]));
  const trialOf = new Map(trials.map((x) => [x.id, x]));
  const out: LineageStep[] = [];
  const seen = new Set<string>();
  let cur = byId.get(from);
  while (cur && !seen.has(cur.id) && out.length < MAX_STEPS) {
    seen.add(cur.id);
    const t = cur.trial_id ? trialOf.get(cur.trial_id) : undefined;
    const m = obj(t?.manifest);
    const change = obj(m?.change);
    out.push({
      version: cur.version, origin: cur.origin, status: cur.status, profile_hash: cur.profile_hash,
      change: str(change?.rule), detail: str(change?.detail) || null, reason_class: str(m?.reason_class),
      evidence: Array.isArray(m?.evidence) ? m.evidence.length : 0, trial_status: t?.status ?? null, why: t?.why ?? null,
      bench: t ? benchOf(t.bench) : null,
    });
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return out;
}
