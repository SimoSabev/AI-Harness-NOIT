"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useT } from "../i18n/client";

// F4 / spec §11: private Broadcast `org:<id>:board` (or `task:<id>`); reconnect → GET /api/board?since=;
// Realtime unavailable > 30 s (or the dev login without Supabase) → polling every 15 s (3 s while a task runs, D-292). ONE aria-live="polite" region;
// "assertive" only for FAILED / BLOCKED (WCAG 4.1.3).
type Msg = { task_id?: string; state?: string; verdict?: string | null; result?: string | null };

export function Live({ topic, since, realtime, fast = false }: { topic: string; since: string; realtime: { url: string; anonKey: string } | null; fast?: boolean }) {
  const router = useRouter();
  const t = useT();
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const sinceRef = useRef(since);
  useEffect(() => {
    sinceRef.current = since;
  }, [since]);

  useEffect(() => {
    let stopped = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    const announce = (m: Msg) => {
      const bad = m.state === "BLOCKED" || m.verdict === "FAILED" || m.result === "FAILED";
      const text = `${t("live.updated", { task: m.task_id ?? t("live.task") })}${m.state ? ` → ${m.state}` : ""}`;
      if (bad) setAssertive(t("live.bad", { text }));
      else setPolite(text);
    };
    const check = async () => {
      try {
        const r = await fetch(`/api/board?since=${encodeURIComponent(sinceRef.current)}`, { credentials: "same-origin", cache: "no-store" });
        if (!r.ok) return;
        const b = (await r.json()) as { columns: { items: { id: string; state: string; last_result: string | null }[] }[]; since: string };
        const changed = b.columns.flatMap((c) => c.items);
        sinceRef.current = b.since;
        if (changed.length > 0 && !stopped) {
          for (const t of changed.slice(0, 3)) announce({ task_id: t.id, state: t.state, result: t.last_result });
          router.refresh();
        }
      } catch {
        // offline: the next tick tries again
      }
    };
    const startPolling = () => {
      if (!poll && !stopped) poll = setInterval(() => void check(), fast ? 3_000 : 15_000);
    };
    if (!realtime) {
      startPolling();
      return () => {
        stopped = true;
        if (poll) clearInterval(poll);
      };
    }
    const sb = createBrowserClient(realtime.url, realtime.anonKey);
    const fallback = setTimeout(startPolling, 30_000);
    const ch = sb
      .channel(topic, { config: { private: true } })
      .on("broadcast", { event: "task" }, (e: { payload: Msg }) => {
        announce(e.payload);
        router.refresh();
      })
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(fallback);
          if (poll) {
            clearInterval(poll);
            poll = null;
          }
          void check(); // reconnect → since
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") startPolling();
      });
    return () => {
      stopped = true;
      clearTimeout(fallback);
      if (poll) clearInterval(poll);
      void sb.removeChannel(ch);
    };
  }, [topic, realtime, router, fast, t]);

  return (
    <>
      <div className="sr-only" aria-live="polite" role="status">{polite}</div>
      <div className="sr-only" aria-live="assertive">{assertive}</div>
    </>
  );
}
