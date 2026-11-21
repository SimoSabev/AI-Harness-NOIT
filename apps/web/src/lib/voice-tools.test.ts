import { describe, expect, it } from "vitest";
import { VOICE_TOOLS } from "@mandat/contract";
import { runVoiceTool } from "./voice-tools";
import type { VoiceDeps } from "./voice-tools";

// D-556: Jarvis acts through the same API as the screens. Each tool → one call; the answer is short text for the model,
// framed as data (English to the model, Bulgarian to the person); a bad call is refused before anything is sent.
function deps(over: Partial<VoiceDeps> = {}) {
  const sent: { method: string; url: string; body?: unknown }[] = [];
  const went: string[] = [];
  const d: VoiceDeps = {
    get: async (url) => (sent.push({ method: "GET", url }), url === "/api/inbox"
      ? { status: 200, body: { items: [{ id: "t_a", text: "Поправи отстъпката", state: "HELD", last_result: "VERIFIED" }], summary: {} } }
      : url === "/api/repos" ? { status: 200, body: { repos: [{ id: "d0000000-0000-4000-8000-0000000000c1", full_name: "local/luxproof" }] } }
      : { status: 200, body: { task: { id: "t_a", text: "Поправи отстъпката", state: "CLOSED", last_result: "VERIFIED", reasons: [] } } }),
    post: async (url, body) => (sent.push({ method: "POST", url, body }), url === "/api/conversations" ? { status: 201, body: { id: "c_new" } } : { status: 200, body: {} }),
    go: (path) => void went.push(path),
    screenText: () => "Tasks\nПоправи отстъпката · VERIFIED",
    defaults: { agent: "claude", model: "claude-sonnet-5-5" },
    ...over,
  };
  return { d, sent, went };
}

describe("Jarvis's tools in the browser (D-556)", () => {
  it("covers every tool of the contract", async () => {
    for (const t of VOICE_TOOLS) expect(typeof (await runVoiceTool(t.name, {}, deps().d))).toBe("string");
  });

  it("open_screen goes to the screen; a project opens its card", async () => {
    const x = deps();
    await runVoiceTool("open_screen", { screen: "projects" }, x.d);
    await runVoiceTool("open_screen", { screen: "accounts" }, x.d);
    await runVoiceTool("open_screen", { screen: "projects", project_id: "d0000000-0000-4000-8000-0000000000c1" }, x.d);
    expect(x.went).toEqual(["/harness", "/settings/subscriptions", "/harness#profile-d0000000-0000-4000-8000-0000000000c1"]);
  });

  it("whats_waiting reads the inbox as data", async () => {
    const r = await runVoiceTool("whats_waiting", {}, deps().d);
    expect(r).toMatch(/^<data>/);
    expect(r).toContain("Поправи отстъпката");
  });

  it("start_conversation sends the person's words with the default agent and opens the conversation", async () => {
    const x = deps();
    const r = await runVoiceTool("start_conversation", { text: "Добави вход с Google" }, x.d);
    expect(x.sent).toEqual([{ method: "POST", url: "/api/conversations", body: { text: "Добави вход с Google", agent: "claude", model: "claude-sonnet-5-5" } }]);
    expect(x.went).toEqual(["/?chat=c_new"]);
    expect(r).toContain("c_new");
  });

  it("send_message, start_work and steer_agent call the screens' own endpoints", async () => {
    const x = deps();
    await runVoiceTool("send_message", { conversation_id: "c_new", text: "Да, само за админи" }, x.d);
    await runVoiceTool("start_work", { conversation_id: "c_new" }, x.d);
    await runVoiceTool("steer_agent", { task_id: "t_a", text: "ползвай zod" }, x.d);
    expect(x.sent.map((s) => s.url)).toEqual(["/api/conversations", "/api/conversations/c_new/start", "/api/tasks/t_a/steer"]);
    expect(x.sent[0]?.body).toEqual({ conversation: "c_new", text: "Да, само за админи", agent: "claude", model: "claude-sonnet-5-5" });
  });

  it("start_project_interview opens the interview of the project (purpose project); approving its brief stays with the person", async () => {
    const x = deps();
    const r = await runVoiceTool("start_project_interview", { project_id: "d0000000-0000-4000-8000-0000000000c1", text: "Пекарна с онлайн поръчки" }, x.d);
    expect(x.sent).toEqual([{ method: "POST", url: "/api/conversations", body: { text: "Пекарна с онлайн поръчки", agent: "claude", model: "claude-sonnet-5-5", repo: "d0000000-0000-4000-8000-0000000000c1", purpose: "project" } }]);
    expect(x.went).toEqual(["/?chat=c_new"]);
    expect(r).toMatch(/c_new/);
    expect(await runVoiceTool("start_project_interview", { text: "без проект" }, deps().d)).toMatch(/bad arguments/);
  });

  it("describe_screen reads the visible page, cut and framed as data", async () => {
    const r = await runVoiceTool("describe_screen", {}, deps({ screenText: () => "x".repeat(10_000) }).d);
    expect(r.startsWith("<data>")).toBe(true);
    expect(r.length).toBeLessThan(4_200);
  });

  it("a bad call is refused with a reason, nothing is sent; an error from the API is said by name", async () => {
    const x = deps({ post: async () => ({ status: 403, body: { error: "not_an_approver" } }) });
    expect(await runVoiceTool("approve_change", {}, x.d)).toMatch(/unknown tool/);
    expect(await runVoiceTool("steer_agent", { task_id: "../x", text: "a" }, x.d)).toMatch(/bad arguments/);
    expect(x.sent).toEqual([]);
    expect(await runVoiceTool("start_work", { conversation_id: "c_new" }, x.d)).toMatch(/not_an_approver/);
  });
});
