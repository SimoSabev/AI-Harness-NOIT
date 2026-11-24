import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { specHash } from "@mandat/contract";
import type { ChatTurn, Spec } from "@mandat/contract";
import type { ConversationRow } from "../lib/conversation-types";

// D-533 (М1 Х2): the thread shows the profile and the axes still unclear, the proposed spec with its criteria, what does
// not change and what is out of scope, and an Approve button only on the current ready spec for a person who may approve.
vi.mock("../i18n/client", () => ({ useT: () => Object.assign((k: string, p?: Record<string, string>) => (p ? `${k}(${Object.values(p).join("|")})` : k), { lang: "en" }) }));

const spec: Spec = {
  goal: "Round discounts half up",
  product: "The cart rounds a discount that ends in .5 up.",
  criteria: [{ id: "AC-1", when: "a discount ends in .5", shall: "round it up", proof: "tests" }],
  unchanged: ["whole-number totals"],
  out_of_scope: ["currencies"],
  profile: "feature",
};
const hash = specHash(spec);
const at = "2026-11-17T10:00:00.000Z";
const row: ConversationRow = { id: "c_x", agent: "claude", model: null, phase: "conversation", status: "idle", usd: 0, budget_usd: 0.5, error: null, task_id: null, repo: null, profile: "feature", unknown_axes: [], spec_hash: hash, spec_ready: true, approved_spec_hash: null };
const turns: ChatTurn[] = [
  { seq: 0, at, kind: "human", text: "round" },
  { seq: 1, at, kind: "tool", tool: "read_file", target: "src/cart.ts", ok: true, note: "lines 1-40 of 600" },
  { seq: 2, at, kind: "axes", axes: { code: "existing", reference: "none", divisible: "no", proof: ["tests"], risk: { level: "low", outward: false }, size: "unknown" }, hint: null, profile: "feature", unknown: ["size"] },
  { seq: 3, at, kind: "spec", spec, hash, ready: true, unknown: [], untestable: [] },
];

async function render(r: ConversationRow, canApprove: boolean): Promise<string> {
  const { ChatThread } = await import("./conversation");
  return renderToStaticMarkup(createElement(ChatThread, { chat: { row: r, turns }, onRetry: () => undefined, onNew: () => undefined, busy: false, canApprove, onApprove: () => undefined }));
}

describe("the spec in the thread (D-533)", () => {
  it("shows the read, the profile with the unclear axes, the criteria, unchanged and out of scope, and Approve", async () => {
    const html = await render(row, true);
    expect(html).toContain("chat.tool.read_file(src/cart.ts)");
    expect(html).toContain("chat.profileName(chat.taskProfile.feature)");
    expect(html).toContain("chat.axesOpen(chat.axis.size)");
    expect(html).toContain("chat.spec.criterion(a discount ends in .5|round it up)");
    expect(html).toContain("whole-number totals");
    expect(html).toContain("currencies");
    expect(html).toContain("chat.spec.approve");
  });
  it("an unreadable answer shows a short message, never raw text (live test, 17.11.2026)", async () => {
    const { ChatThread } = await import("./conversation");
    const bad: ChatTurn = { seq: 4, at, kind: "assistant", text: "", questions: [], brief: null, model: "m", usd: 0, unreadable: true };
    const html = renderToStaticMarkup(createElement(ChatThread, { chat: { row, turns: [bad] }, onRetry: () => undefined, onNew: () => undefined, busy: false }));
    expect(html).toContain("chat.unreadable");
  });
  it("no Approve for a person who may not, for an approved spec or for a replaced one", async () => {
    expect(await render(row, false)).not.toContain("chat.spec.approve");
    const approved = await render({ ...row, approved_spec_hash: hash }, true);
    expect(approved).toContain("chat.spec.approved");
    expect(approved).not.toContain(">chat.spec.approve<");
    expect(await render({ ...row, spec_hash: `sha256:${"0".repeat(64)}` }, true)).toContain("chat.spec.replaced");
  });
});

describe("a spent subscription in the thread (D-591, live test 24.11)", () => {
  it("says the limit and when it resets, with Try again; an unknown reset still names the limit", async () => {
    const html = await render({ ...row, status: "limit", error: "subscription_limit resets 2026-11-26T09:00:00.000Z" }, true);
    expect(html).toMatch(/chat\.limit\([^)]*26/);
    expect(html).toContain("chat.retry");
    expect(html).not.toContain("chat.failed");
    expect(await render({ ...row, status: "limit", error: "subscription_limit" }, true)).toContain("chat.limitUnknown");
  });
});
