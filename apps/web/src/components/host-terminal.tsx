"use client";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import { useT } from "../i18n/client";
import { postJson } from "../lib/client/api";
import type { DesktopClient } from "../lib/client/desktop";
import { terminalActivity, terminalEvent } from "../lib/client/host-terminal";
import { btn } from "./ui";

// E9g A4 (AC-12.8, D-375): the host terminal panel — the person's own shell in a granted folder (`terminal` scope), run
// by the desktop app's main process on THIS computer, NOT in the sandbox (the panel says so first). Each typed line goes
// to task_activities (the server redacts secrets), never to the ledger. Closing the panel closes the shell.

const cssVar = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function HostTerminal({ bridge, taskId, folder, onClose }: { bridge: DesktopClient; taskId: string; folder: string; onClose: () => void }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [exited, setExited] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    let id: string | null = null;
    let term: Terminal | null = null;
    let disposed = false;
    const offs: (() => void)[] = [];
    void (async () => {
      const { Terminal: Xterm } = await import("@xterm/xterm");
      if (disposed || !box.current) return;
      term = new Xterm({
        cols: 100,
        rows: 18,
        cursorBlink: true,
        fontFamily: cssVar("--font-mono") || "monospace",
        fontSize: 12,
        theme: { background: cssVar("--canvas"), foreground: cssVar("--ink"), cursor: cssVar("--accent"), selectionBackground: cssVar("--accent-soft") },
      });
      term.open(box.current);
      offs.push(
        bridge.onCommand((cmd) => {
          const e = terminalEvent(cmd, id);
          if (!e) return;
          if (e.type === "output") term?.write(e.data);
          else if (e.type === "line") void postJson(`/api/tasks/${taskId}/local-activity`, terminalActivity(e.line));
          else setExited(e.code);
        }),
      );
      const r = await bridge.call("terminalOpen", { task_id: taskId, path: folder, cols: term.cols, rows: term.rows });
      if (disposed) {
        if (r.ok) void bridge.call("terminalClose", { id: r.value.id });
        return;
      }
      if (!r.ok) return setError(r.error.message);
      id = r.value.id;
      const sid = id;
      void postJson(`/api/tasks/${taskId}/local-activity`, { kind: "local_terminal", outcome: "opened" });
      const onData = term.onData((data) => void bridge.call("terminalWrite", { id: sid, data: data.slice(0, 16_384) }));
      const onResize = term.onResize((s) => void bridge.call("terminalResize", { id: sid, cols: s.cols, rows: s.rows }));
      offs.push(() => onData.dispose(), () => onResize.dispose());
      term.focus();
    })();
    return () => {
      disposed = true;
      for (const off of offs) off();
      if (id) void bridge.call("terminalClose", { id });
      term?.dispose();
    };
  }, [bridge, taskId, folder]);

  return (
    <section aria-labelledby="host-term-h" className="mt-3 rounded-lg border border-warn bg-warn-soft p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id="host-term-h" className="font-display text-sm font-semibold">{t("terminal.title")}</h4>
        <button type="button" className={btn.secondary} onClick={onClose}>{t("terminal.close")}</button>
      </div>
      <p className="mt-1 mb-2 text-xs text-ink" data-testid="host-terminal-label">{t("terminal.notSandbox", { path: folder })}</p>
      {error ? (
        <p role="alert" className="text-sm text-bad">{error}</p>
      ) : (
        <div ref={box} role="region" aria-label={t("terminal.region", { path: folder })} className="overflow-hidden rounded bg-canvas p-1" />
      )}
      {exited !== undefined && <p role="status" className="mt-2 text-xs text-mute">{t("terminal.exited", { code: exited ?? "?" })}</p>}
    </section>
  );
}
