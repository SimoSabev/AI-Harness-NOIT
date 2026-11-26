"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../i18n/client";
import { SIDE_COOKIE, SIDE_DEFAULT, SIDE_MAX, SIDE_MIN, clampSide, sideCookie } from "../lib/side-pane";
import type { SideState } from "../lib/side-pane";
import { Tip } from "./ui";

// D-620: the list of conversations beside the work, like the side bar of any chat product: it folds to a slim strip
// (the button, or ⌘B / Ctrl+B) and is as wide as the person drags its edge (arrows on the edge too; a double click
// gives the default back). The choice is a cookie, so the next page is drawn the same from the first byte.
const PANEL = "M4 5h16v14H4zM9 5v14";

function save(s: SideState): void {
  document.cookie = `${SIDE_COOKIE}=${sideCookie(s)}; path=/; max-age=31536000; samesite=lax`;
}

export function SidePane({ initial, waiting, children }: { initial: SideState; waiting: number; children: React.ReactNode }) {
  const t = useT();
  const [s, setS] = useState(initial);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; w: number } | null>(null);
  const set = useCallback((next: SideState) => { setS(next); save(next); }, []);
  const toggle = useCallback(() => setS((cur) => { const next = { ...cur, folded: !cur.folded }; save(next); return next; }), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b") { e.preventDefault(); toggle(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
  const icon = (d: string) => <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
  const iconBtn = "flex size-8 items-center justify-center rounded-md text-mute transition hover:bg-raised hover:text-ink";
  if (s.folded) {
    return (
      <aside aria-label={t("ws.tasks")} className="hidden w-12 shrink-0 flex-col items-center gap-1 border-r border-line pr-2 md:flex">
        <Tip label={t("side.unfold")} keys={t("side.keys")}>
          <button type="button" onClick={toggle} aria-expanded="false" className={iconBtn}>{icon(PANEL)}<span className="sr-only">{t("side.unfold")}</span></button>
        </Tip>
        <Tip label={t("ws.new")}>
          <Link href="/" className={iconBtn}>{icon("M12 5v14M5 12h14")}<span className="sr-only">{t("ws.new")}</span></Link>
        </Tip>
        {waiting > 0 && (
          <Tip label={t("nav.tip.waiting", { n: waiting })}>
            <button type="button" onClick={toggle} className="mt-1 flex size-8 items-center justify-center rounded-md font-mono text-xs font-semibold text-warn hover:bg-raised">
              <span aria-hidden="true">{waiting}</span><span className="sr-only">{t("nav.tip.waiting", { n: waiting })}</span>
            </button>
          </Tip>
        )}
      </aside>
    );
  }
  return (
    <aside aria-label={t("ws.tasks")} style={{ width: s.width }} className={`relative hidden min-h-0 shrink-0 flex-col border-r border-line pr-3 md:flex ${dragging ? "select-none" : ""}`}>
      <div className="flex items-center justify-between gap-2 pb-1 pl-2">
        <span className="text-xs font-medium text-mute">{t("ws.tasks")}</span>
        <Tip label={t("side.fold")} keys={t("side.keys")} side="bottom">
          <button type="button" onClick={toggle} aria-expanded="true" className={iconBtn}>{icon(PANEL)}<span className="sr-only">{t("side.fold")}</span></button>
        </Tip>
      </div>
      {children}
      <div role="separator" aria-orientation="vertical" aria-label={t("side.resize")} aria-valuenow={s.width} aria-valuemin={SIDE_MIN} aria-valuemax={SIDE_MAX} tabIndex={0}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); start.current = { x: e.clientX, w: s.width }; setDragging(true); }}
        onPointerMove={(e) => { const st = start.current; if (st) setS((cur) => ({ ...cur, width: clampSide(st.w + e.clientX - st.x) })); }}
        onPointerUp={() => { start.current = null; setDragging(false); save(s); }}
        onDoubleClick={() => set({ ...s, width: SIDE_DEFAULT })}
        onKeyDown={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); set({ ...s, width: clampSide(s.width + (e.key === "ArrowLeft" ? -16 : 16)) }); } }}
        className="group absolute -right-1.5 top-0 z-10 h-full w-3 cursor-col-resize outline-none">
        <span className={`mx-auto block h-full w-0.5 rounded-full transition ${dragging ? "bg-accent" : "bg-transparent group-hover:bg-line-strong group-focus-visible:bg-accent"}`} />
      </div>
    </aside>
  );
}
