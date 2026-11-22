import { describe, expect, it } from "vitest";
import { VOICE_TOOLS } from "@mandat/contract";
import { runVoiceTool } from "./voice-tools";
import type { VoiceDeps, VoiceUi } from "./voice-tools";
import type { RawControl } from "./voice-controls";

// D-556: Jarvis acts through the same API as the screens. Each tool → one call; the answer is short text for the model,
// framed as data (English to the model, Bulgarian to the person); a bad call is refused before anything is sent.
function fakeUi(controls: RawControl[]) {
  const did: string[] = [];
  const ui: VoiceUi = {
    scan: () => controls,
    type: async (id, text, mode) => (did.push(`type ${id} ${mode} ${text}`), true),
    press: (id) => (did.push(`press ${id}`), true),
    choose: (id, option) => (did.push(`choose ${id} ${option}`), true),
  };
  return { ui, did };
}
const ctl = (id: string, over: Partial<RawControl> = {}): RawControl => ({ id, tag: "button", label: "Start the work", disabled: false, voice: null, inTotpForm: false, ...over });

function deps(over: Partial<VoiceDeps> = {}) {
  const sent: { method: string; url: string; body?: unknown }[] = [];
  const went: string[] = [];
  const d: VoiceDeps = {
    get: async (url) => (sent.push({ method: "GET", url }), url === "/api/inbox"
      ? { status: 200, body: { items: [{ id: "t_a", text: "Поправи отстъпката", state: "HELD", last_result: "VERIFIED" }], summary: {} } }
      : url === "/api/repos" ? { status: 200, body: { repos: [{ id: "d0000000-0000-4000-8000-0000000000c1", full_name: "local/luxproof" }] } }
      : { status: 200, body: { task: { id: "t_a", text: "Поправи отстъпката", state: "CLOSED", last_result: "VERIFIED", reasons: [] } } }),
    post: async (url, body) => (sent.push({ method: "POST", url, body }), url === "/api/conversations" ? { status: 201, body: { id: "c_new" } } : url === "/api/research" ? { status: 201, body: { id: "q_new" } } : { status: 200, body: {} }),
    put: async (url, body) => (sent.push({ method: "PUT", url, body }), { status: 200, body: { ok: true } }),
    go: (path) => void went.push(path),
    screenText: () => "Tasks\nПоправи отстъпката · VERIFIED",
    defaults: { agent: "claude", model: "claude-sonnet-5-5" },
    ui: fakeUi([]).ui,
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

  it("D-582 list_controls: what can be used, as data; approve and key controls are not even listed", async () => {
    const { ui } = fakeUi([ctl("v1"), ctl("v2", { label: "Approve and merge" }), ctl("v3", { tag: "select", label: "Model", value: "a", options: ["a", "b"] }), ctl("v4", { tag: "input", inputType: "password", label: "Key" })]);
    const r = await runVoiceTool("list_controls", {}, deps({ ui }).d);
    expect(r).toMatch(/^<data>/);
    expect(r).toContain("Start the work");
    expect(r).toContain("Model");
    expect(r).not.toMatch(/Approve|Key/);
  });

  it("D-582 write_prompt types into the prompt field and does not send; press sends when the person says so", async () => {
    const { ui, did } = fakeUi([ctl("v1", { tag: "textarea", label: "Describe the task", voice: "prompt" }), ctl("v2", { label: "Send" })]);
    const d = deps({ ui }).d;
    expect(await runVoiceTool("write_prompt", { text: "Добави програма за лоялност" }, d)).toMatch(/not sent/);
    expect(did).toEqual(["type v1 replace Добави програма за лоялност"]);
    await runVoiceTool("press", { control: "v2" }, d);
    expect(did.at(-1)).toBe("press v2");
  });

  it("D-582 type_text and choose act on an allowed control; a blocked or unknown one is refused and nothing happens", async () => {
    const { ui, did } = fakeUi([ctl("v1", { tag: "input", label: "Budget" }), ctl("v2", { label: "Одобри" }), ctl("v3", { tag: "select", label: "Model", options: ["a", "b"] }), ctl("v4", { label: "Confirm", inTotpForm: true })]);
    const d = deps({ ui }).d;
    await runVoiceTool("type_text", { control: "v1", text: "0.5", mode: "append" }, d);
    await runVoiceTool("choose", { control: "v3", option: "b" }, d);
    expect(await runVoiceTool("press", { control: "v2" }, d)).toMatch(/Refused: .*person/);
    expect(await runVoiceTool("press", { control: "v4" }, d)).toMatch(/Refused: .*person/);
    expect(await runVoiceTool("type_text", { control: "v9", text: "x" }, d)).toMatch(/no such control/);
    expect(await runVoiceTool("choose", { control: "v3", option: "zzz" }, d)).toMatch(/no such option/);
    expect(did).toEqual(["type v1 append 0.5", "choose v3 b"]);
  });

  it("D-582 write_prompt with no prompt field on this screen says so", async () => {
    expect(await runVoiceTool("write_prompt", { text: "x" }, deps({ ui: fakeUi([ctl("v1")]).ui }).d)).toMatch(/no prompt field/);
  });

  it("D-584 start_research asks the research engine (not a code task) and opens the research screen", async () => {
    const x = deps();
    const r = await runVoiceTool("start_research", { question: "Най-добрите университети по софтуерно инженерство в България", depth: "deep" }, x.d);
    expect(x.sent).toEqual([{ method: "POST", url: "/api/research", body: { question: "Най-добрите университети по софтуерно инженерство в България", depth: "deep", goal: "balanced", instructions: "" } }]);
    expect(x.went).toEqual(["/research"]);
    expect(r).toContain("q_new");
  });

  it("D-584 research_result reads the report as data, or says it is not ready; stop_research stops it", async () => {
    const ready = deps({ get: async (url) => (url === "/api/research/q_new/report?format=json" ? { status: 200, body: { answer: "СУ, ТУ-София" } } : { status: 404, body: { error: "no_report" } }) });
    expect(await runVoiceTool("research_result", { research_id: "q_new" }, ready.d)).toContain("СУ");
    expect(await runVoiceTool("research_result", { research_id: "q_other" }, ready.d)).toMatch(/not ready/);
    const x = deps();
    await runVoiceTool("stop_research", { research_id: "q_new" }, x.d);
    expect(x.sent).toEqual([{ method: "POST", url: "/api/research/q_new/stop", body: {} }]);
  });

  it("D-584 list_models reads the connections; set_defaults changes only what was said", async () => {
    const x = deps({ get: async (url) => (url === "/api/connections" ? { status: 200, body: { connections: [{ id: "anthropic", models: ["claude-opus-5-5"] }], preferences: { defaultModel: null } } } : { status: 404, body: {} }) });
    expect(await runVoiceTool("list_models", {}, x.d)).toContain("claude-opus-5-5");
    await runVoiceTool("set_defaults", { model: "claude-opus-5-5", task_mode: "work_now" }, x.d);
    expect(x.sent).toEqual([{ method: "PUT", url: "/api/preferences", body: { defaultModel: "claude-opus-5-5", taskMode: "work_now" } }]);
  });

  it("D-586 open_screen reaches every screen of the app, each to a page that exists", async () => {
    const { VoiceScreen } = await import("@mandat/contract");
    const { existsSync } = await import("node:fs");
    for (const screen of VoiceScreen.options) {
      const x = deps();
      await runVoiceTool("open_screen", { screen }, x.d);
      const p = (x.went[0] ?? "").split("#")[0] ?? "";
      expect(existsSync(new URL(`../app${p === "/" ? "" : p}/page.tsx`, import.meta.url)), `${screen} → ${p}`).toBe(true);
    }
    expect(VoiceScreen.options.length).toBeGreaterThanOrEqual(24);
  });
});

