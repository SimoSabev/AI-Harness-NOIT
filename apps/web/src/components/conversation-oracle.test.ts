import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { specHash } from "@mandat/contract";
import type { ChatTurn, Spec } from "@mandat/contract";
import type { ConversationRow, OracleView } from "../lib/conversation-types";
import type { Chat } from "./conversation";

// D-534 (М1 Х3): under an approved spec that needs one, the oracle: building, not ready with the reasons, ready with
// red/green per criterion on the current code and Approve oracle; never a test's name or content.
vi.mock("../i18n/client", () => ({ useT: () => Object.assign((k: string, p?: Record<string, string>) => (p ? `${k}(${Object.values(p).join("|")})` : k), { lang: "en" }) }));

const spec: Spec = { goal: "Round half up", product: "", criteria: [{ id: "AC-1", when: "a discount ends in .5", shall: "round it up", proof: "tests" }, { id: "AC-2", when: "x", shall: "y", proof: "tests" }], unchanged: [], out_of_scope: [], profile: "feature" };
const hash = specHash(spec);
const at = "2026-11-17T10:00:00.000Z";
const row: ConversationRow = { id: "c_x", agent: "claude", model: null, phase: "conversation", status: "idle", usd: 0, budget_usd: 0.5, error: null, task_id: null, profile: "feature", unknown_axes: [], spec_hash: hash, spec_ready: true, approved_spec_hash: hash };
const turns: ChatTurn[] = [{ seq: 0, at, kind: "spec", spec, hash, ready: true, unknown: [], untestable: [] }];
const OH = `sha256:${"e".repeat(64)}`;
const oracle = (o: Partial<OracleView>): OracleView => ({ id: "o_x", status: "building", spec_hash: hash, oracle_hash: null, problems: [], red_on_base: [], tests: 0, ...o });

async function render(chat: Partial<Chat>, canApprove = true): Promise<string> {
  const { ChatThread } = await import("./conversation");
  return renderToStaticMarkup(createElement(ChatThread, { chat: { row, turns, oracleRequired: true, oracle: null, ...chat }, onRetry: () => undefined, onNew: () => undefined, busy: false, canApprove }));
}

describe("the oracle in the thread (D-534)", () => {
  it("no oracle yet: what it is and Build oracle; nothing for a spec that needs none or is not approved", async () => {
    const html = await render({});
    expect(html).toContain("chat.oracle.none");
    expect(html).toContain("chat.oracle.build");
    expect(await render({ oracleRequired: false })).not.toContain("chat.oracle");
    expect(await render({ row: { ...row, approved_spec_hash: null } })).not.toContain("chat.oracle.build");
  });
  it("building: the status, no button", async () => {
    const html = await render({ oracle: oracle({ status: "building" }) });
    expect(html).toContain("chat.oracle.building");
    expect(html).not.toContain("chat.oracle.build<");
    expect(html).not.toContain("chat.oracle.approve");
  });
  it("not ready: every reason with its criterion id, red/green on base, and Build oracle again", async () => {
    const html = await render({ oracle: oracle({ status: "not_ready", problems: [{ kind: "green_on_base", id: "AC-2" }, { kind: "untagged_test", id: "1" }], red_on_base: [{ criterion_id: "AC-1", red: true }, { criterion_id: "AC-2", red: false }] }) });
    expect(html).toContain("chat.oracle.notReady");
    expect(html).toContain("chat.oracle.problem.green_on_base(AC-2)");
    expect(html).toContain("chat.oracle.problem.untagged_test(1)");
    expect(html).toContain("chat.oracle.red");
    expect(html).toContain("chat.oracle.green");
    expect(html).toContain("chat.oracle.rebuild");
    expect(html).not.toContain("chat.oracle.approve");
  });
  it("ready: the count, per-criterion red on base and Approve oracle only for a person who may approve", async () => {
    const ready = oracle({ status: "ready", oracle_hash: OH, tests: 3, red_on_base: [{ criterion_id: "AC-1", red: true }, { criterion_id: "AC-2", red: true }] });
    const html = await render({ oracle: ready });
    expect(html).toContain("chat.oracle.ready(3)");
    expect(html).toContain("chat.oracle.approve");
    expect(html).not.toContain("chat.oracle.rebuild");
    expect(await render({ oracle: ready }, false)).not.toContain("chat.oracle.approve");
    const approved = await render({ oracle: { ...ready, status: "approved" } });
    expect(approved).toContain("chat.oracle.approved");
    expect(approved).not.toContain(">chat.oracle.approve<");
  });
});
