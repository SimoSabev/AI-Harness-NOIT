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

const row: ConversationRow = { id: "c_x", agent: "claude", model: null, phase: "work", status: "idle", usd: 0, budget_usd: 0.5, error: null, task_id: null, profile: "feature", unknown_axes: [], spec_hash: null, spec_ready: true, approved_spec_hash: null, purpose: "task", project_approved: false };
type UnitIn = Omit<JobView["units"][number], "wave" | "pilot" | "copy"> & Partial<Pick<JobView["units"][number], "wave" | "pilot" | "copy">>;
const strategy: JobView["strategy"] = { profile: "feature", mode: "single", waves: 1, pilot: null, roles: [{ role: "planner", agent: "claude", model: null }, { role: "writer", agent: "claude", model: null }, { role: "advisor", agent: "claude", model: null }], reasons: ["job.why.single", "job.why.fresh"] };
const job = (o: Omit<Partial<JobView>, "units"> & { units?: UnitIn[] }): JobView => {
  const units: UnitIn[] = o.units ?? [
    { id: "u1", title: "the 10% rule", criteria: ["AC-1"], status: "passed", result: "VERIFIED", failing: [], task_id: "t_a" },
    { id: "u2", title: "coupons", criteria: ["AC-2", "AC-3"], status: "failed", result: "FAILED", failing: ["AC-3"], task_id: "t_b" },
  ];
  return {
    id: "j_x", status: "running", question: null, current: "u2", final_task_id: null, seal: null, merged_sha: null, strategy, gates: [{ id: "D5.hidden", status: "pending" }],
    ...o,
    units: units.map((u) => ({ wave: 0, pilot: false, copy: null, ...u })),
  };
};

async function render(chat: Partial<Chat>, canApprove = true): Promise<string> {
  const { ChatThread } = await import("./conversation");
  return renderToStaticMarkup(createElement(ChatThread, { chat: { row, turns: [], ...chat }, onRetry: () => undefined, onNew: () => undefined, busy: false, canApprove }));
}

describe("the job in the thread (D-535)", () => {
  it("the plan: units with criteria, status and verdict; the current unit with its task; failing criteria; no approve button", async () => {
    const html = await render({ job: job({}) });
    expect(html).toContain("chat.job.status.running");
    expect(html).toContain("the 10% rule");
    expect(html).toContain("AC-2, AC-3");
    expect(html).toContain("chat.job.unit.passed");
    expect(html).toContain("chat.job.failing(AC-3)");
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("/?task=t_b");
    expect(html).not.toContain("chat.job.approve<");
    expect(await render({})).not.toContain("chat.job");
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
  it("sealed: checked and not checked, and Approve and merge only for a person who may approve", async () => {
    const sealed = job({ status: "sealed", current: null, seal: { hash: `sha256:${"a".repeat(64)}`, verdict: "VERIFIED", result_ref: "b".repeat(40), checked: ["AC-1", "AC-2"], unchecked: ["AC-3: proof by a person"] } });
    const html = await render({ job: sealed });
    expect(html).toContain("chat.job.seal.checked");
    expect(html).toContain("AC-1, AC-2");
    expect(html).toContain("AC-3: proof by a person");
    expect(html).toContain("chat.job.approve<");
    expect(await render({ job: sealed }, false)).not.toContain("chat.job.approve<");
    expect(await render({ job: { ...sealed, status: "delivered", merged_sha: "c".repeat(40) } })).toContain("chat.job.merged(cccccccccccc)");
  });
});

// D-540: "Bring into my folder" on a delivered job — only for a person who may approve; the result says what happened
// or exactly why not, with the command the person can run themselves
describe("bring into my folder (D-540)", () => {
  const t = Object.assign((k: string, p?: Record<string, string | number>) => (p ? `${k}(${Object.values(p).join("|")})` : k), { lang: "en" }) as unknown as T;
  const delivered = job({ status: "delivered", current: null, merged_sha: "c".repeat(40) });
  const card = async (a: Partial<JobActions>) => {
    const { JobCard } = await import("./job-card");
    return renderToStaticMarkup(createElement(JobCard, { job: delivered, t, a: { canApprove: true, busy: false, onApprove: () => undefined, onBring: () => undefined, brought: null, ...a } }));
  };
  it("the button only on a delivered job and for a person who may approve", async () => {
    expect(await card({})).toContain("chat.job.bring<");
    expect(await card({ canApprove: false })).not.toContain("chat.job.bring<");
    const { JobCard } = await import("./job-card");
    expect(renderToStaticMarkup(createElement(JobCard, { job: job({}), t, a: { canApprove: true, busy: false, onApprove: () => undefined, onBring: () => undefined, brought: null } }))).not.toContain("chat.job.bring<");
  });
  it("done: from → to; refused: the reason and the command, nothing else", async () => {
    expect(await card({ brought: { ok: true, folder: "/home/s/shop", from: "a".repeat(40), to: "c".repeat(40), files: 3 } })).toContain("chat.job.bring.done(/home/s/shop|3)");
    expect(await card({ brought: { ok: true, folder: "/home/s/shop", from: "c".repeat(40), to: "c".repeat(40), files: 0 } })).toContain("chat.job.bring.upToDate(/home/s/shop)");
    const html = await card({ brought: { ok: false, reason: "dirty", folder: "/home/s/shop", detail: "2", command: 'git -C "/home/s/shop" pull --ff-only "/m/shop.git" main' } });
    expect(html).toContain("chat.job.bring.no.dirty(/home/s/shop|2)");
    expect(html).toContain("chat.job.bring.yourself");
    expect(html).toContain("pull --ff-only");
  });
  it("the strategy, the roles and why; each unit's wave, pilot and own copy; the gates of the final check (D-558)", async () => {
    const html = await render({ job: job({ strategy: { ...strategy, mode: "waves", waves: 2, pilot: { units: 1, state: "running" } }, units: [{ id: "u1", title: "a", criteria: ["AC-1"], status: "running", result: null, failing: [], task_id: "t_a", wave: 1, pilot: true, copy: { task: "t_a", attempt: 2, state: "RUNNING" } }] }) });
    for (const k of ["job.strategy.waves(2)", "job.strategy.pilotRunning(1)", "job.role.planner", "job.why.single", "job.unit.wave(2)", "job.unit.pilot", "job.unit.copy(t_a|2|RUNNING)", "job.gates.title", "job.gate.D5.hidden", "job.gateStatus.pending"]) expect(html).toContain(k);
  });
});
