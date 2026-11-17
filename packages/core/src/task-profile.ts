import { AXIS_NAMES, OracleKind } from "@mandat/contract";
import type { AxisName, ProfilePlan, ProofKind, TaskAxes, TaskProfile, TaskProfileId } from "@mandat/contract";

// Х0 (D-532, docs/prd/heavy-process.md §0): the six axes of a task decide its profile and the plan of its oracle.
// Pure: no I/O. A profile is named only when the axes clearly say so; otherwise "other", whose plan is still built
// from the axes. Upgrade, tests and infra cannot be told apart by the axes alone, so they come only from a hint (the
// model's proposal, Х1) that the axes do not contradict.

export const PROFILE_NAMES: Readonly<Record<TaskProfileId, string>> = {
  new_product: "New product",
  feature: "Feature",
  migration: "Migration or port",
  refactor: "Refactor",
  upgrade: "Upgrade",
  hardening: "Hardening",
  tests: "Tests",
  infra: "Infrastructure",
  research: "Research",
  other: "Other",
};

/** what one unit of work is for the profile */
export const PROFILE_UNITS: Readonly<Record<TaskProfileId, string>> = {
  new_product: "feature",
  feature: "criterion",
  migration: "file",
  refactor: "module",
  upgrade: "package",
  hardening: "finding",
  tests: "module",
  infra: "resource",
  research: "question",
  other: "unit",
};

const proofs = (a: TaskAxes): ProofKind[] => (a.proof === "unknown" ? [] : a.proof);
const has = (a: TaskAxes, p: ProofKind) => proofs(a).includes(p);
const refKind = (a: TaskAxes) => (typeof a.reference === "object" ? a.reference.kind : a.reference);
const onlySoftProof = (a: TaskAxes) => a.proof !== "unknown" && a.proof.every((p) => p === "numbers" || p === "human");

/** sufficient conditions, on known values only; the first match wins (they do not overlap) */
const CLEAR: readonly [TaskProfileId, (a: TaskAxes) => boolean][] = [
  ["migration", (a) => refKind(a) === "old_system" || refKind(a) === "reference_impl"],
  ["hardening", (a) => a.code === "existing" && refKind(a) === "standard" && a.risk !== "unknown" && a.risk.level === "high"],
  ["refactor", (a) => a.code === "existing" && a.reference === "none" && has(a, "differential")],
  ["research", (a) => a.code === "none" && a.reference === "none" && onlySoftProof(a)],
  ["new_product", (a) => a.code === "none" && a.reference === "none" && (a.size === "l" || a.size === "xl") && (has(a, "tests") || has(a, "ui"))],
  ["feature", (a) => a.code === "existing" && a.reference === "none" && (has(a, "tests") || has(a, "ui")) && !has(a, "differential")],
];

/** necessary conditions: a hint is taken only when the known axes do not contradict it ("unknown" never does) */
const FITS: Readonly<Record<TaskProfileId, (a: TaskAxes) => boolean>> = {
  new_product: (a) => a.code !== "existing",
  feature: (a) => a.code !== "none",
  migration: (a) => a.reference === "unknown" || refKind(a) === "old_system" || refKind(a) === "reference_impl",
  refactor: (a) => a.code !== "none",
  upgrade: (a) => a.code !== "none",
  hardening: (a) => a.code !== "none",
  tests: (a) => a.code !== "none",
  infra: () => true,
  research: (a) => a.proof === "unknown" || onlySoftProof(a),
  other: () => true,
};

function profileId(axes: TaskAxes, hint?: TaskProfileId): TaskProfileId {
  if (hint && FITS[hint](axes)) return hint;
  return CLEAR.find(([, clear]) => clear(axes))?.[0] ?? "other";
}

function oracleFor(axes: TaskAxes, id: TaskProfileId): OracleKind[] {
  const codeWork = id !== "research";
  const risky = axes.risk !== "unknown" && (axes.risk.level === "high" || axes.risk.outward);
  const want: Record<OracleKind, boolean> = {
    hidden_tests: codeWork,
    differential: typeof axes.reference === "object" || has(axes, "differential"),
    e2e: has(axes, "ui"),
    mutation_graded: codeWork,
    exploit: risky,
    citations: id === "research",
    human_review: risky || has(axes, "human"),
  };
  return OracleKind.options.filter((k) => want[k]);
}

function planFor(axes: TaskAxes, id: TaskProfileId): ProfilePlan {
  return {
    oracle: oracleFor(axes, id),
    unit: PROFILE_UNITS[id],
    parallel: axes.divisible === "yes" ? "waves" : "single",
    pilot: axes.size === "l" || axes.size === "xl",
  };
}

/** axes → profile; `hint` is a proposed profile, used only when the axes do not contradict it */
export function deriveProfile(axes: TaskAxes, hint?: TaskProfileId): TaskProfile {
  const id = profileId(axes, hint);
  return { id, name: PROFILE_NAMES[id], axes, plan: planFor(axes, id) };
}

/** the axes still "unknown", in axis order; the interview continues while this is not empty */
export function unknownAxes(axes: TaskAxes): AxisName[] {
  return AXIS_NAMES.filter((name) => axes[name] === "unknown");
}
