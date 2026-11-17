import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ConversationRow, JobView } from "../lib/conversation-types";
import type { Chat } from "./conversation";

// D-535: the job card in the thread — the plan with each unit's criteria, status and verdict, the current unit, a
// parked question, the seal (checked / not checked) and the approve-merge button only on a sealed job for a person
// who may approve. Never a test's name or content (the view has none).
vi.mock("../i18n/client", () => ({ useT: () => Object.assign((k: string, p?: Record<string, string>) => (p ? `${k}(${Object.values(p).join("|")})` : k), { lang: "en" }) }));

const row: ConversationRow = { id: "c_x", agent: "claude", model: null, phase: "work", status: "idle", usd: 0, budget_usd: 0.5, error: null, task_id: null, profile: "feature", unknown_axes: [], spec_hash: null, spec_ready: true, approved_spec_hash: null };
const job = (o: Partial<JobView>): JobView => ({
  id: "j_x", status: "running", question: null, current: "u2", final_task_id: null, seal: null, merged_sha: null,
  units: [
    { id: "u1", title: "the 10% rule", criteria: ["AC-1"], status: "passed", result: "VERIFIED", failing: [], task_id: "t_a" },
    { id: "u2", title: "coupons", criteria: ["AC-2", "AC-3"], status: "failed", result: "FAILED", failing: ["AC-3"], task_id: "t_b" },
  ],
  ...o,
});

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
