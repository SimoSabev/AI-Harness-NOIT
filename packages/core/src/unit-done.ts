import { oracleTag } from "@mandat/contract";

// D-573 (live test 21.11): an earlier unit already built what this unit was for; its agent rightly changed nothing and
// the job parked on the empty change. Each landed unit runs every hidden test (D5), so the last landed verdict says
// whether this unit's criteria already pass. Pure.

/** D5 keeps at most this many failed ids; a list this long may hide more, so it never counts as met */
const FAILED_CAP = 50;

/** whether every one of these criteria passes in a D5 hidden-tests evidence row */
export function criteriaMet(criteria: readonly string[], d5: { status: string; data: unknown } | null): boolean {
  if (!d5 || criteria.length === 0 || d5.data === null || typeof d5.data !== "object") return false;
  const data = d5.data as { failed?: unknown; total?: unknown; met?: unknown };
  // D-574: a job unit's D5 lists the criteria whose hidden tests all passed, in or out of its scope
  if (Array.isArray(data.met)) return criteria.every((c) => (data.met as unknown[]).includes(c));
  if (typeof data.total !== "number" || data.total <= 0) return false;
  if (d5.status === "pass") return true;
  if (d5.status !== "fail" || !Array.isArray(data.failed) || data.failed.length >= FAILED_CAP) return false;
  const red = new Set(data.failed.flatMap((id) => (typeof id === "string" ? [oracleTag(id)] : [])));
  return criteria.every((c) => !red.has(c));
}
