"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VOICE_TOOLS } from "@mandat/contract";
import { useT } from "../i18n/client";
import type { Key } from "../i18n/t";
import { postJson } from "../lib/client/api";
import { runVoiceTool } from "../lib/voice-tools";
import type { VoiceDeps } from "../lib/voice-tools";

// D-556: Jarvis — the voice of the harness. One button on every page (in the root layout, so a conversation survives
// moving between screens). The session goes straight to ElevenLabs with a signed URL from the proxy; the tools run here,
// through the same API as the screens.
type Phase = "idle" | "connecting" | "listening" | "speaking" | "error";
interface Session { endSession(): Promise<void> }

const ERRORS = new Set(["voice_not_configured", "voice_no_agent", "voice_key_rejected"]);
const SCREEN_TEXT_MAX = 6000;

async function getJson(url: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await fetch(url, { credentials: "same-origin", headers: { accept: "application/json" } });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

export function VoiceButton() {
  const t = useT();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<Key | null>(null);
  const session = useRef<Session | null>(null);

  useEffect(() => () => void session.current?.endSession().catch(() => undefined), []);

  const stop = async () => {
    const s = session.current;
    session.current = null;
    setPhase("idle");
    await s?.endSession().catch(() => undefined);
  };

  const start = async () => {
    setError(null);
    setPhase("connecting");
    const r = await postJson("/api/voice/session", {});
    const url = typeof r.body.signed_url === "string" ? r.body.signed_url : null;
    const def = r.body.defaults as { agent?: unknown; model?: unknown } | null | undefined;
    if (!url) {
      const code = typeof r.body.error === "string" && ERRORS.has(r.body.error) ? r.body.error : "generic";
      setError(`voice.err.${code}` as Key);
      setPhase("error");
      return;
    }
    const deps: VoiceDeps = {
      get: getJson,
      post: (u, b) => postJson(u, b),
      go: (path) => router.push(path),
      screenText: () => (document.querySelector("main")?.innerText ?? document.body.innerText).slice(0, SCREEN_TEXT_MAX),
      defaults: { agent: typeof def?.agent === "string" ? def.agent : "claude", model: typeof def?.model === "string" ? def.model : null },
    };
    const clientTools = Object.fromEntries(VOICE_TOOLS.map((tool) => [tool.name, (params: unknown) => runVoiceTool(tool.name, params, deps)]));
    try {
      const { Conversation } = await import("@elevenlabs/client");
      session.current = await Conversation.startSession({
        signedUrl: url,
        connectionType: "websocket",
        clientTools,
        onModeChange: ({ mode }) => setPhase(mode === "speaking" ? "speaking" : "listening"),
        onStatusChange: ({ status }) => {
          if (status === "disconnected") {
            session.current = null;
            setPhase("idle");
          }
        },
        onError: () => {
          setError("voice.err.generic");
          setPhase("error");
        },
      });
      setPhase("listening");
    } catch (e) {
      session.current = null;
      setError(e instanceof DOMException && e.name === "NotAllowedError" ? "voice.err.mic" : "voice.err.generic");
      setPhase("error");
    }
  };

  const live = phase === "listening" || phase === "speaking" || phase === "connecting";
  const label = phase === "connecting" ? t("voice.connecting") : phase === "listening" ? t("voice.listening") : phase === "speaking" ? t("voice.speaking") : t("voice.button");
  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {error && <p role="alert" className="max-w-xs rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{t(error)}</p>}
      <button type="button" onClick={() => void (live ? stop() : start())} aria-pressed={live} aria-label={live ? t("voice.stop") : t("voice.talk")}
        className="flex items-center gap-2 rounded-full border border-line bg-panel px-4 py-2.5 font-display text-sm font-medium tracking-wide text-ink shadow-lg transition hover:bg-raised aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-text">
        <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${phase === "speaking" ? "animate-pulse bg-accent" : phase === "listening" ? "bg-ok" : phase === "connecting" ? "animate-pulse bg-warn" : "bg-mute"}`} />
        {label}
      </button>
    </div>
  );
}
