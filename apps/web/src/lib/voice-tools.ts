import { VoiceToolCall, voiceToolNames } from "@mandat/contract";
import type { VoiceScreen } from "@mandat/contract";
import { controlBlocked, controlView, promptField } from "./voice-controls";
import type { RawControl } from "./voice-controls";

// D-556: Jarvis acts through the same API as the screens — no new powers. Each client tool of the voice agent is one
// call here; what goes back to the model is short English text, page and task content inside <data>, so it stays data (the model answers the person in Bulgarian).
/** D-582: the page as a person sees it — the browser adapter is voice-dom.ts; ids are data-voice-id */
export interface VoiceUi {
  scan(): RawControl[];
  type(id: string, text: string, mode: "replace" | "append"): Promise<boolean>;
  press(id: string): boolean;
  choose(id: string, option: string): boolean;
}

export interface VoiceDeps {
  get(url: string): Promise<{ status: number; body: Record<string, unknown> }>;
  post(url: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }>;
  put(url: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }>;
  go(path: string): void;
  screenText(): string;
  /** the agent and model a new conversation starts with (the person's remembered default) */
  defaults: { agent: string; model: string | null };
  ui: VoiceUi;
}

export const SCREEN_PATH: Record<VoiceScreen, string> = {
  tasks: "/", new_task: "/tasks/new", projects: "/harness", harness: "/harness", add_project: "/projects/add", research: "/research", memory: "/memory", night: "/night",
  library: "/library", tools: "/tools", agents: "/agents", board: "/board", metrics: "/metrics", overview: "/overview", system: "/system", keys: "/keys",
  settings: "/settings", settings_account: "/settings/account", settings_api_keys: "/settings/api-keys", settings_local: "/settings/local", settings_models: "/settings/models",
  settings_roles: "/settings/roles", accounts: "/settings/subscriptions", settings_tools: "/settings/tools", settings_voice: "/settings/voice", welcome: "/welcome", device: "/account/device",
};
const DATA_MAX = 4000;
const data = (v: unknown): string => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return `<data>${s.length > DATA_MAX ? `${s.slice(0, DATA_MAX)}…` : s}</data>`;
};
const failed = (r: { status: number; body: Record<string, unknown> }): string | null =>
  r.status >= 400 ? `Failed: ${typeof r.body.error === "string" ? r.body.error : `HTTP ${r.status}`}.` : null;

/** the control by id, if Jarvis may use it; else the refusal to say */
function usable(d: VoiceDeps, id: string): { c: RawControl } | { refusal: string } {
  const c = d.ui.scan().find((x) => x.id === id);
  if (!c) return { refusal: "Failed: no such control on this screen (call list_controls again)." };
  const why = controlBlocked(c);
  return why === null ? { c } : { refusal: `Refused: this control stays with the person (${why}); tell them where to press it.` };
}

export async function runVoiceTool(tool: string, args: unknown, d: VoiceDeps): Promise<string> {
  const c = VoiceToolCall.safeParse({ tool, args: args ?? {} });
  if (!c.success) return voiceToolNames().includes(tool) ? "Refused: bad arguments." : "Refused: unknown tool.";
  const call = c.data;
  const chat = (text: string, conversation?: string) => ({ ...(conversation ? { conversation } : {}), text, agent: d.defaults.agent, ...(d.defaults.model ? { model: d.defaults.model } : {}) });
  switch (call.tool) {
    case "open_screen": {
      const base = SCREEN_PATH[call.args.screen];
      d.go(call.args.project_id && base === "/harness" ? `${base}#profile-${call.args.project_id}` : base);
      return `Opened the ${call.args.screen} screen.`;
    }
    case "whats_waiting": {
      const r = await d.get("/api/inbox");
      return failed(r) ?? data(r.body);
    }
    case "list_projects": {
      const r = await d.get("/api/repos");
      return failed(r) ?? data(r.body);
    }
    case "task_status": {
      const r = await d.get(call.args.task_id ? `/api/tasks/${call.args.task_id}` : "/api/board");
      return failed(r) ?? data(r.body);
    }
    case "start_conversation": {
      const r = await d.post("/api/conversations", { ...chat(call.args.text), ...(call.args.project_id ? { repo: call.args.project_id } : {}) });
      const id = typeof r.body.id === "string" ? r.body.id : null;
      if (failed(r) || !id) return failed(r) ?? "Failed: no conversation.";
      d.go(`/?chat=${id}`);
      return `Started conversation ${id}. The harness asks its questions on the screen.`;
    }
    case "start_project_interview": {
      // D-564: the interview of the whole project (D-557); Jarvis starts it, the brief is approved by the person on the screen
      const r = await d.post("/api/conversations", { ...chat(call.args.text), repo: call.args.project_id, purpose: "project" });
      const id = typeof r.body.id === "string" ? r.body.id : null;
      if (failed(r) || !id) return failed(r) ?? "Failed: no conversation.";
      d.go(`/?chat=${id}`);
      return `Started the project interview ${id}. The harness asks about the project on the screen; the person approves the brief there.`;
    }
    case "send_message": {
      const r = await d.post("/api/conversations", chat(call.args.text, call.args.conversation_id));
      return failed(r) ?? "Sent the answer.";
    }
    case "start_work": {
      const r = await d.post(`/api/conversations/${call.args.conversation_id}/start`, {});
      return failed(r) ?? "The work started.";
    }
    case "steer_agent": {
      const r = await d.post(`/api/tasks/${call.args.task_id}/steer`, { text: call.args.text });
      return failed(r) ?? "Passed the instruction to the agent.";
    }
    case "describe_screen":
      return data(d.screenText().replace(/\n{3,}/g, "\n\n").trim());
    case "start_research": {
      // D-584: a question about the world goes to the research engine, never to a code task
      const r = await d.post("/api/research", { question: call.args.question, depth: call.args.depth ?? "standard", goal: "balanced", instructions: call.args.instructions ?? "" });
      const id = typeof r.body.id === "string" ? r.body.id : null;
      if (failed(r) || !id) return failed(r) ?? "Failed: no research.";
      d.go("/research");
      return `Started research ${id}. It takes a few minutes; read it with research_result.`;
    }
    case "research_result": {
      const r = await d.get(`/api/research/${call.args.research_id}/report?format=json`);
      if (r.status === 404) return "The research is not ready yet.";
      return failed(r) ?? data(r.body);
    }
    case "stop_research": {
      const r = await d.post(`/api/research/${call.args.research_id}/stop`, {});
      return failed(r) ?? "Stopped the research.";
    }
    case "list_models": {
      const r = await d.get("/api/connections");
      return failed(r) ?? data(r.body);
    }
    case "set_defaults": {
      const b = { ...(call.args.agent ? { defaultAgent: call.args.agent } : {}), ...(call.args.model ? { defaultModel: call.args.model } : {}), ...(call.args.task_mode ? { taskMode: call.args.task_mode } : {}) };
      const r = await d.put("/api/preferences", b);
      return failed(r) ?? "Changed the defaults.";
    }
    case "list_controls":
      return data(d.ui.scan().map(controlView).filter((v) => v !== null));
    case "write_prompt": {
      const id = promptField(d.ui.scan());
      if (!id) return "Failed: no prompt field on this screen; open the screen with the task box or the conversation first.";
      return (await d.ui.type(id, call.args.text, "replace")) ? `Wrote the prompt into ${id}; not sent. Read it back and press the send button when the person says so.` : "Failed: could not write into the prompt field.";
    }
    case "type_text": {
      const u = usable(d, call.args.control);
      if ("refusal" in u) return u.refusal;
      return (await d.ui.type(u.c.id, call.args.text, call.args.mode ?? "replace")) ? `Typed into ${u.c.id}.` : "Failed: that control does not take text.";
    }
    case "press": {
      const u = usable(d, call.args.control);
      if ("refusal" in u) return u.refusal;
      return d.ui.press(u.c.id) ? `Pressed ${u.c.id} (${u.c.label.slice(0, 60)}).` : "Failed: could not press it.";
    }
    case "choose": {
      const u = usable(d, call.args.control);
      if ("refusal" in u) return u.refusal;
      if (u.c.tag !== "select" || !(u.c.options ?? []).includes(call.args.option)) return "Failed: no such option in that list.";
      return d.ui.choose(u.c.id, call.args.option) ? `Chose ${call.args.option}.` : "Failed: could not choose it.";
    }
  }
}
