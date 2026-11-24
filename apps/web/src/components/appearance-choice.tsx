"use client";
import { useState } from "react";
import { useT } from "../i18n/client";
import { ACCENTS, GROUNDS, NOVAS, SCALES, appearanceAttrs } from "../lib/appearance";
import type { Appearance, Ground } from "../lib/appearance";
import { prefCookie } from "../lib/prefs";

// D-599: Settings → Appearance — the accent, the ground, Nova's colour and the size. Each choice writes its cookie and
// repaints the page at once (the same attributes the root layout sets on the server).
const DATA = ["data-accent", "data-ground"] as const;
const VARS = ["--user-accent", "--user-accent-ink", "--nova"] as const;

function paint(a: Appearance): void {
  const el = document.documentElement;
  const { data, style } = appearanceAttrs(a);
  for (const d of DATA) {
    const v = data[d];
    if (v) el.setAttribute(d, v);
    else el.removeAttribute(d);
  }
  for (const k of VARS) {
    const v = style[k];
    if (v) el.style.setProperty(k, v);
    else el.style.removeProperty(k);
  }
  el.style.fontSize = style.fontSize ?? "";
}

const swatch = "size-5 shrink-0 rounded-full border border-line-strong";
const choice = "flex cursor-pointer items-center gap-2.5 rounded-md border border-line px-3 py-2 text-sm transition hover:bg-raised aria-pressed:border-accent aria-pressed:bg-accent-soft";

export function AppearanceChoice({ value }: { value: Appearance }) {
  const t = useT();
  const [a, setA] = useState(value);
  const set = (next: Appearance) => {
    setA(next);
    document.cookie = prefCookie("accent", next.accent ?? "");
    document.cookie = prefCookie("ground", next.ground);
    document.cookie = prefCookie("nova", next.nova ?? "");
    document.cookie = prefCookie("scale", String(next.scale));
    paint(next);
  };
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-sm font-semibold">{t("look.accent")}</legend>
        <p className="mb-2 text-xs text-mute">{t("look.accentHint")}</p>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((x) => (
            <button key={x.id} type="button" aria-pressed={a.accent === x.hex} className={choice} onClick={() => set({ ...a, accent: x.hex })}>
              <span aria-hidden="true" className={swatch} style={{ background: x.hex ?? "#a6c25e" }} />{t(x.label)}
            </button>
          ))}
          <label className={`${choice} border-dashed`}>
            {t("look.accent.custom")}
            <input type="color" value={a.accent ?? "#a6c25e"} onChange={(e) => set({ ...a, accent: e.target.value.toLowerCase() })} className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t("look.ground")}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GROUNDS.map((g) => (
            <button key={g.id} type="button" aria-pressed={a.ground === g.id} className={`${choice} flex-col items-stretch`} onClick={() => set({ ...a, ground: g.id as Ground })}>
              <span aria-hidden="true" className="block h-10 rounded-[6px] border border-line-strong p-1.5" style={{ background: g.swatch[0] }}>
                <span className="block h-full rounded-[3px]" style={{ background: g.swatch[1] }} />
              </span>
              {t(g.label)}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t("look.nova")}</legend>
        <div className="flex flex-wrap gap-2">
          {NOVAS.map((n) => (
            <button key={n.id} type="button" aria-pressed={a.nova === n.hex} className={choice} onClick={() => set({ ...a, nova: n.hex })}>
              <svg viewBox="0 0 64 64" aria-hidden="true" className="size-5" style={{ color: n.hex ?? "var(--accent)" }}><path fill="currentColor" d="M32 4C34 24 40 30 60 32C40 34 34 40 32 60C30 40 24 34 4 32C24 30 30 24 32 4Z" /></svg>
              {t(n.label)}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t("look.scale")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {SCALES.map((s) => (
            <button key={s} type="button" aria-pressed={a.scale === s} className={`${choice} font-mono text-xs`} onClick={() => set({ ...a, scale: s })}>{s}%</button>
          ))}
        </div>
      </fieldset>
      <button type="button" className="text-sm text-mute underline-offset-4 hover:text-ink hover:underline" onClick={() => set({ accent: null, ground: "night", nova: null, scale: 100 })}>{t("look.reset")}</button>
    </div>
  );
}
