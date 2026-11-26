import type { Key, Params } from "../i18n/t";

// D-540 (live test 18.11): a job's internal tasks (the oracle, the units, the final check) are listed with a short title
// from their data — the spec's goal, the unit's id and title — never with their whole instruction text.
export type InternalRole = "oracle" | "unit" | "final" | "compare";
export interface TitleSource { text: string; internal_role?: InternalRole | null; unit_id?: string | null; unit_title?: string | null; spec_goal?: string | null }

const TITLE_MAX = 100;
const SEP = " · ";
const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function taskTitle(x: TitleSource, t: (key: Key, params?: Params) => string): string {
  if (!x.internal_role) return x.text;
  const unit = clean(x.unit_id);
  // D-633: the single agent a job is compared with
  if (x.internal_role === "compare") return t("task.title.compare");
  const kind = x.internal_role === "oracle" ? t("task.title.oracle") : x.internal_role === "final" ? t("task.title.final") : unit !== "" ? t("task.title.unit", { unit }) : t("task.title.unitBare");
  const detail = clean(x.internal_role === "unit" ? x.unit_title : x.spec_goal);
  return detail === "" ? kind : clip(`${kind}${SEP}${detail}`, TITLE_MAX);
}
