import { VoiceToolCall, voiceToolNames } from "@mandat/contract";
import type { VoiceScreen } from "@mandat/contract";

// D-556: Jarvis acts through the same API as the screens — no new powers. Each client tool of the voice agent is one
// call here; what goes back to the model is short text inside <данни>, so whatever a page or a task says stays data.
export interface VoiceDeps {
  get(url: string): Promise<{ status: number; body: Record<string, unknown> }>;
  post(url: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }>;
  go(path: string): void;
  screenText(): string;
  /** the agent and model a new conversation starts with (the person's remembered default) */
  defaults: { agent: string; model: string | null };
}

const SCREEN_PATH: Record<VoiceScreen, string> = {
  tasks: "/", projects: "/harness", research: "/research", memory: "/memory", settings: "/settings", overview: "/overview", harness: "/harness", accounts: "/settings/subscriptions",
};
const DATA_MAX = 4000;
const data = (v: unknown): string => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return `<данни>${s.length > DATA_MAX ? `${s.slice(0, DATA_MAX)}…` : s}</данни>`;
};
const failed = (r: { status: number; body: Record<string, unknown> }): string | null =>
  r.status >= 400 ? `Не стана: ${typeof r.body.error === "string" ? r.body.error : `HTTP ${r.status}`}.` : null;

export async function runVoiceTool(tool: string, args: unknown, d: VoiceDeps): Promise<string> {
  const c = VoiceToolCall.safeParse({ tool, args: args ?? {} });
  if (!c.success) return voiceToolNames().includes(tool) ? "Отказано: грешни аргументи." : "Отказано: непознат инструмент.";
  const call = c.data;
  const chat = (text: string, conversation?: string) => ({ ...(conversation ? { conversation } : {}), text, agent: d.defaults.agent, ...(d.defaults.model ? { model: d.defaults.model } : {}) });
  switch (call.tool) {
    case "open_screen": {
      const base = SCREEN_PATH[call.args.screen];
      d.go(call.args.project_id && base === "/harness" ? `${base}#profile-${call.args.project_id}` : base);
      return `Отворих екрана „${call.args.screen}“.`;
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
      if (failed(r) || !id) return failed(r) ?? "Не стана: няма разговор.";
      d.go(`/?chat=${id}`);
      return `Започнах разговор ${id}. Харнесът ще зададе въпросите си на екрана.`;
    }
    case "send_message": {
      const r = await d.post("/api/conversations", chat(call.args.text, call.args.conversation_id));
      return failed(r) ?? "Предадох отговора.";
    }
    case "start_work": {
      const r = await d.post(`/api/conversations/${call.args.conversation_id}/start`, {});
      return failed(r) ?? "Работата тръгна.";
    }
    case "steer_agent": {
      const r = await d.post(`/api/tasks/${call.args.task_id}/steer`, { text: call.args.text });
      return failed(r) ?? "Предадох указанието на агента.";
    }
    case "describe_screen":
      return data(d.screenText().replace(/\n{3,}/g, "\n\n").trim());
  }
}
