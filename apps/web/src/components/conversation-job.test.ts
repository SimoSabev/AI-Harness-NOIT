import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ConversationRow, JobView } from "../lib/conversation-types";
import type { Chat } from "./conversation";
import type { T } from "../i18n/t";
import type { JobActions } from "./job-card";

// D-535: the job card in the thread — the plan with each unit's criteria, status and verdict, the current unit, a
// parked question, the seal (checked / not checked) and the approve-merge button only on a sealed job for a person
// who may approve. Never a test's name or content (the view has none).
vi.mock("../i18n/client", () => ({ useT: () => Object.assign((k: string, p?: Record<string, string>) => (p ? `${k}(${Object.values(p).join("|")})` : k), { lang: "en" }) }));

const row: ConversationRow = { id: "c_x", agent: "claude", model: null, phase: "work", status: "idle", usd: 0, budget_usd: 0.5, error: null, task_id: null, repo: null, profile: "feature", unknown_axes: [], spec_hash: null, spec_ready: true, approved_spec_hash: null, purpose: "task", project_approved: false };
type UnitIn = Omit<JobView["units"][number], "wave" | "pilot" | "copy"> & Partial<Pick<JobView["units"][number], "wave" | "pilot" | "copy">>;
const strategy: JobView["strategy"] = { profile: "feature", mode: "single", waves: 1, pilot: null, roles: [{ role: "planner", agent: "claude", model: null }, { role: "writer", agent: "claude", model: null }, { role: "advisor", agent: "claude", model: null }], reasons: ["job.why.single", "job.why.fresh"] };
const job = (o: Omit<Partial<JobView>, "units"> & { units?: UnitIn[] }): JobView => {
  const units: UnitIn[] = o.units ?? [
    { id: "u1", title: "the 10% rule", criteria: ["AC-1"], status: "passed", result: "VERIFIED", failing: [], task_id: "t_a" },
    { id: "u2", title: "coupons", criteria: ["AC-2", "AC-3"], status: "failed", result: "FAILED", failing: ["AC-3"], task_id: "t_b" },
  ];
  return {
    id: "j_x", status: "running", question: null, current: "u2", final_task_id: null, seal: null, merged_sha: null, strategy, gates: [{ id: "D5.hidden", status: "pending" }], compare: null,
    ...o,
    units: units.map((u) => ({ wave: 0, pilot: false, copy: null, ...u })),
  };
};

async function render(chat: Partial<Chat>, canApprove = true): Promise<string> {
  const { ChatThread } = await import("./conversation");
  return renderToStaticMarkup(createElement(ChatThread, { chat: { row, turns: [], ...chat }, onRetry: () => undefined, onNew: () => undefined, busy: false, canApprove }));
}

describe("the job in the thread (D-535)", () => {
  it("D-615: M4's single-agent arm on its own row — its account and model, its hidden tests and a link to its task", async () => {
    const html = await render({ job: job({ compare: { task: "t_cmp_x", agent: "claude@lichno-2", model: "opus", state: "CLOSED", verdict: "VERIFIED", passed: 12, total: 14 } }) });
    expect(html).toContain("job.strategy.compare");
    expect(html).toContain("lichno-2");
    expect(html).toContain("opus");
    expect(html).toContain("job.compare.verdict.VERIFIED(12|14)");
    expect(html).toContain("/?task=t_cmp_x");
    expect(await render({ job: job({}) })).not.toContain("job.strategy.compare");
    expect(await render({ job: job({ compare: { task: "t_cmp_x", agent: "claude", model: null, state: "RUNNING", verdict: null, passed: 0, total: 0 } }) })).toContain("job.compare.running");
  });
  it("the plan: units with criteria, status and verdict; the current unit with its task; failing criteria; no approve button", async () => {
    const html = await render({ job: job({}) });
    expect(html).toContain("chat.job.status.running");
    expect(html).toContain("the 10% rule");
    // D-710: every unit links to its own task, not only the current one
    expect(html).toContain("/?task=t_a");
    expect(html).toContain("chat.job.unit.passed");
    expect(html).toContain("chat.job.failing(AC-3)");
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("/?task=t_b");
    expect(html).not.toContain("chat.job.approve<");
    expect(await render({})).not.toContain("chat.job");
  });
  it("D-710: the thread's scroller is a positioned box, so screen-reader-only text inside it cannot stretch the page", async () => {
    const html = await render({ job: job({}) });
    expect(html).toContain('class="relative min-h-0 flex-1 space-y-4 overflow-y-auto');
    // D-712: the auto-scroll stops above the sticky box on a phone
    expect(html).toContain("scroll-mb-[calc(var(--composer-h,7.5rem)+1rem)]");
  });
  it("D-710: the model's own invalid call is a quiet line, never the validator's message; a refused tool keeps its reason", async () => {
    const turns = [
      { seq: 1, at: "2026-11-27T00:00:00.000Z", kind: "tool", tool: "propose_spec", target: "call", ok: false, note: "the call was not valid: hint: Too big: expected string to have <=40 characters" },
      { seq: 2, at: "2026-11-27T00:00:01.000Z", kind: "tool", tool: "read_file", target: "src/x.ts", ok: false, note: "outside the project" },
    ] as unknown as Chat["turns"];
    const html = await render({ turns });
    expect(html).toContain("chat.tool.selfFixed");
    expect(html).not.toContain("Too big");
    expect(html).toContain("chat.tool.refused(outside the project)");
  });
  it("a unit that waits for a person shows as waiting for you (D-542)", async () => {
    const html = await render({ job: job({ units: [{ id: "u1", title: "the 10% rule", criteria: ["AC-1"], status: "parked", result: "FAILED", failing: ["AC-1"], task_id: "t_a" }] }) });
    expect(html).toContain("chat.job.unit.parked");
  });
  it("parked: the question", async () => {
    const html = await render({ job: job({ status: "parked", question: "Unit u2 stopped after 3 attempt(s). Criteria still failing: AC-3." }) });
    expect(html).toContain("chat.job.question");
    expect(html).toContain("Criteria still failing: AC-3.");
  });
  it("sealed (D-710): the verdict first, how many criteria pass, what is left to the person, the change, one button", async () => {
    const sealed = job({ status: "sealed", current: null, seal: { hash: `sha256:${"a".repeat(64)}`, verdict: "VERIFIED", result_ref: "b".repeat(40), checked: ["AC-1", "AC-2"], unchecked: ["AC-3: proof by a person", "D10.lockfile: not run"] } });
    const html = await render({ job: sealed });
    expect(html).toContain("job.head.verified");
    expect(html).toContain("job.criteria(2|3)");
    expect(html).toContain("job.decide.title<");
    expect(html).toContain("AC-3 is proved by you, not by tests");
    expect(html).toContain("job.notRun(whether the lockfile matches the code)");
    expect(html).toContain("job.change.loading");
    expect(html).toContain("chat.job.approve<");
    // the units, gates and result are under Details once the job is decided; never a detector code in the main view
    expect(html.indexOf("job.details")).toBeLessThan(html.indexOf("the 10% rule"));
    expect(html).not.toMatch(/D10\.lockfile|proof by a person/);
    const viewer = await render({ job: sealed }, false);
    expect(viewer).not.toContain("chat.job.approve<");
    expect(viewer).toContain("job.decide.titleViewer");
    expect(viewer).not.toContain("job.change.loading");
    expect(await render({ job: { ...sealed, status: "delivered", merged_sha: "c".repeat(40) } })).toContain("chat.job.merged(cccccccccccc)");
  });
  it("D-598/D-710: an UNKNOWN seal says what is left in the task page's words, and asks for the code only after the click", async () => {
    const unknown = job({ status: "sealed", current: null, seal: { hash: `sha256:${"a".repeat(64)}`, verdict: "UNKNOWN", result_ref: "b".repeat(40), checked: ["AC-1"], unchecked: ["D11.mutation: a mutant survived at src/a.ts:3 (0 → 1); a person decides"] } });
    const html = await render({ job: unknown });
    expect(html).toContain("job.head.unknown");
    expect(html).toContain("src/a.ts:3 (0 → 1)");
    expect(html).toContain("broke nothing the tests check");
    expect(html).not.toContain("Mandat");
    expect(html).not.toContain("a person decides");
    expect(html).toContain("chat.job.approve<");
    expect(html).not.toContain("chat.job.code");
    const verified = await render({ job: job({ status: "sealed", current: null, seal: { hash: `sha256:${"a".repeat(64)}`, verdict: "VERIFIED", result_ref: "b".repeat(40), checked: ["AC-1"], unchecked: [] } }) });
    expect(verified).not.toContain("job.decide.title");
    expect(verified).not.toContain("chat.job.code");
  });
  it("D-710: the approve step — VERIFIED approves at once; UNKNOWN asks once more: presence here, six digits elsewhere", async () => {
    const { approveStep } = await import("./job-card");
    expect(approveStep({ unknown: false, asking: false, local: false, code: "" })).toMatchObject({ send: "approve", input: false, code: undefined });
    expect(approveStep({ unknown: true, asking: false, local: true, code: "" })).toMatchObject({ send: "ask", label: "chat.job.approve" });
    expect(approveStep({ unknown: true, asking: true, local: true, code: "" })).toEqual({ hint: "job.code.local", label: "job.code.merge", input: false, ready: true, send: "approve", code: undefined });
    expect(approveStep({ unknown: true, asking: true, local: false, code: "123" })).toMatchObject({ input: true, ready: false, code: undefined });
    expect(approveStep({ unknown: true, asking: true, local: false, code: "123456" })).toMatchObject({ ready: true, code: "123456" });
  });
  it("D-710: once the job is decided, the oracle is one quiet line, not red chips above the verdict", async () => {
    const oracle = { id: "o_x", status: "approved" as const, spec_hash: "s", oracle_hash: "h", problems: [], red_on_base: [{ criterion_id: "AC-1", red: true }, { criterion_id: "AC-2", red: true }] };
    const r = { ...row, approved_spec_hash: "s" };
    const sealed = job({ status: "sealed", current: null, seal: { hash: `sha256:${"a".repeat(64)}`, verdict: "VERIFIED", result_ref: "b".repeat(40), checked: ["AC-1", "AC-2"], unchecked: [] } });
    const { ChatThread } = await import("./conversation");
    const html = (j: JobView) => renderToStaticMarkup(createElement(ChatThread, { chat: { row: r, turns: [], oracleRequired: true, oracle, job: j }, onRetry: () => undefined, onNew: () => undefined, busy: false, canApprove: true }));
    expect(html(sealed)).toContain("chat.oracle.decided(2)");
    expect(html(job({}))).not.toContain("chat.oracle.decided");
  });
});

// D-540: "Bring into my folder" on a delivered job — only for a person who may approve; the result says what happened
// or exactly why not, with the command the person can run themselves
describe("bring into my folder (D-540)", () => {
  const t = Object.assign((k: string, p?: Record<string, string | number>) => (p ? `${k}(${Object.values(p).join("|")})` : k), { lang: "en" }) as unknown as T;
  const delivered = job({ status: "delivered", current: null, merged_sha: "c".repeat(40) });
  const card = async (a: Partial<JobActions>) => {
    const { JobCard } = await import("./job-card");
    return renderToStaticMarkup(createElement(JobCard, { job: delivered, t, conversation: "c_x", a: { canApprove: true, busy: false, onApprove: () => undefined, onBring: () => undefined, brought: null, ...a } }));
  };
  it("the button only on a delivered job and for a person who may approve", async () => {
    expect(await card({})).toContain("chat.job.bring<");
    expect(await card({ canApprove: false })).not.toContain("chat.job.bring<");
    const { JobCard } = await import("./job-card");
    expect(renderToStaticMarkup(createElement(JobCard, { job: job({}), t, conversation: "c_x", a: { canApprove: true, busy: false, onApprove: () => undefined, onBring: () => undefined, brought: null } }))).not.toContain("chat.job.bring<");
  });
  it("done: from → to; refused: the reason and the command, nothing else", async () => {
    expect(await card({ brought: { ok: true, folder: "/home/s/shop", from: "a".repeat(40), to: "c".repeat(40), files: 3 } })).toContain("chat.job.bring.done(/home/s/shop|3)");
    expect(await card({ brought: { ok: true, folder: "/home/s/shop", from: "c".repeat(40), to: "c".repeat(40), files: 0 } })).toContain("chat.job.bring.upToDate(/home/s/shop)");
    const html = await card({ brought: { ok: false, reason: "dirty", folder: "/home/s/shop", detail: "2", command: 'git -C "/home/s/shop" pull --ff-only "/m/shop.git" main' } });
    expect(html).toContain("chat.job.bring.no.dirty(/home/s/shop|2)");
    expect(html).toContain("chat.job.bring.yourself");
    expect(html).toContain("pull --ff-only");
  });
  it("the strategy, the roles and why; each unit's attempt; the gates of the final check (D-558)", async () => {
    const html = await render({ job: job({ strategy: { ...strategy, mode: "waves", waves: 2, pilot: { units: 1, state: "running" } }, units: [{ id: "u1", title: "a", criteria: ["AC-1"], status: "running", result: null, failing: [], task_id: "t_a", wave: 1, pilot: true, copy: { task: "t_a", attempt: 2, state: "RUNNING" } }] }) });
    for (const k of ["job.strategy.waves(2)", "job.strategy.pilotRunning(1)", "job.role.planner", "job.why.single", "job.unit.attempt(2)", "job.gates.title", "job.gate.D5.hidden", "job.gateStatus.pending"]) expect(html).toContain(k);
  });
  it("while the planner works the card says so, not a default team (live test 20.11)", async () => {
    const html = await render({ job: job({ status: "planning", units: [] }) });
    expect(html).toContain("job.strategy.planning");
    expect(html).not.toContain("job.strategy.single");
  });
});
