"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VOICE_TOOLS } from "@mandat/contract";
import { useT } from "../i18n/client";
import type { Key } from "../i18n/t";
import { postJson } from "../lib/client/api";
import { runVoiceTool } from "../lib/voice-tools";
import type { VoiceDeps } from "../lib/voice-tools";
import { domUi } from "../lib/voice-dom";
import { actionLine, NOVA_START, novaReducer } from "../lib/nova-line";
import { NovaRibbon } from "./nova-ribbon";

// D-556, D-596: Nova — the voice of Harnova. One button on every page (in the root layout, so a conversation survives
// moving between screens). The session goes straight to ElevenLabs with a signed URL from the proxy; the tools run here,
// through the same API as the screens. D-599: the button is the star and the ribbon of the brand kit; every tool call is a
// step with its verb and target, her speech and the person's are captions, and the control she acts on gets the clamp.
interface Session { endSession(): Promise<void> }
const CLAMP_MS = 2500;

/** D-599: the clamp (four accent corners) on the control Nova acts on, for a moment */
function clampOn(id: string | null): void {
  if (!id) return;
  const el = document.querySelector<HTMLElement>(`[data-voice-id="${CSS.escape(id)}"]`);
  if (!el) return;
  el.classList.add("clamp");
  window.setTimeout(() => el.classList.remove("clamp"), CLAMP_MS);
}

const ERRORS = new Set(["voice_not_configured", "voice_no_agent", "voice_key_rejected", "proxy_not_running"]);
const SCREEN_TEXT_MAX = 6000;

async function getJson(url: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await fetch(url, { credentials: "same-origin", headers: { accept: "application/json" } });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

export function VoiceButton() {
  const t = useT();
  const router = useRouter();
  const [nova, send] = useReducer(novaReducer, NOVA_START);
  const [open, setOpen] = useState(false);
  const session = useRef<Session | null>(null);

  useEffect(() => () => void session.current?.endSession().catch(() => undefined), []);

  const stop = async () => {
    const s = session.current;
    session.current = null;
    send({ type: "stop" });
    setOpen(false);
    await s?.endSession().catch(() => undefined);
  };

  const start = async () => {
    send({ type: "connecting" });
    const r = await postJson("/api/voice/session", {});
    const url = typeof r.body.signed_url === "string" ? r.body.signed_url : null;
    const def = r.body.defaults as { agent?: unknown; model?: unknown } | null | undefined;
    if (!url) {
      const code = typeof r.body.error === "string" && ERRORS.has(r.body.error) ? r.body.error : "generic";
      send({ type: "error", key: `voice.err.${code}` as Key });
      return;
    }
    const deps: VoiceDeps = {
      get: getJson,
      post: (u, b) => postJson(u, b),
      put: (u, b) => postJson(u, b, "PUT"),
      go: (path) => router.push(path),
      screenText: () => (document.querySelector("main")?.innerText ?? document.body.innerText).slice(0, SCREEN_TEXT_MAX),
      defaults: { agent: typeof def?.agent === "string" ? def.agent : "claude", model: typeof def?.model === "string" ? def.model : null },
      ui: domUi(),
    };
    const label = (id: string) => deps.ui.scan().find((c) => c.id === id)?.label ?? null;
    const clientTools = Object.fromEntries(VOICE_TOOLS.map((tool) => [tool.name, async (params: unknown) => {
      const line = actionLine(tool.name, params, label);
      send({ type: "tool", key: line.key, ...(line.params ? { params: line.params } : {}), at: Date.now() });
      const control = params && typeof params === "object" && typeof (params as { control?: unknown }).control === "string" ? (params as { control: string }).control : null;
      clampOn(control);
      try {
        return await runVoiceTool(tool.name, params, deps);
      } finally {
        send({ type: "tool_done" });
      }
    }]));
    try {
      const { Conversation } = await import("@elevenlabs/client");
      session.current = await Conversation.startSession({
        signedUrl: url,
        connectionType: "websocket",
        clientTools,
        onModeChange: ({ mode }) => send({ type: "mode", mode: mode === "speaking" ? "speaking" : "listening" }),
        onMessage: ({ message, source }) => send(source === "user" ? { type: "heard", text: message } : { type: "said", text: message }),
        onStatusChange: ({ status }) => {
          if (status === "disconnected") {
            session.current = null;
            send({ type: "stop" });
          }
        },
        onError: () => send({ type: "error", key: "voice.err.generic" }),
      });
      send({ type: "mode", mode: "listening" });
    } catch (e) {
      session.current = null;
      send({ type: "error", key: e instanceof DOMException && e.name === "NotAllowedError" ? "voice.err.mic" : "voice.err.generic" });
    }
  };

  const live = nova.phase !== "idle" && nova.phase !== "error";
  return (
    <div data-voice="never" className="fixed bottom-4 right-4 z-40">
      <NovaRibbon state={nova} t={t} open={open} onToggle={() => setOpen((o) => !o)} live={live} onStar={() => void (live ? stop() : start())} />
    </div>
  );
}
