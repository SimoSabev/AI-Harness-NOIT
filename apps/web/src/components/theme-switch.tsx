"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../i18n/client";
import type { Lang } from "../i18n/t";
import { LANG_CHOICES, THEMES, VIEWS, prefCookie } from "../lib/prefs";
import type { Theme, View } from "../lib/prefs";

// D-305: the theme; the cookie is written here and the page repaints at once.
export function ThemeChoice({ value }: { value: Theme }) {
  const tr = useT();
  const [v, setV] = useState(value);
  const pick = (t: Theme) => {
    setV(t);
    document.cookie = prefCookie("theme", t);
    document.documentElement.dataset.theme = t;
  };
  return (
    <fieldset className="grid gap-2 sm:grid-cols-3">
      <legend className="sr-only">{tr("settings.theme")}</legend>
      {THEMES.map((t) => (
        <label key={t.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line p-3 transition hover:bg-raised has-[:checked]:border-accent-text has-[:checked]:bg-accent-soft">
          <input type="radio" name="theme" value={t.id} checked={v === t.id} onChange={() => pick(t.id)} className="accent-[var(--accent)]" />
          <span className="flex items-center gap-2 text-sm font-medium">
            <span aria-hidden="true" className={`hex inline-block h-4 w-5 border ${t.id === "dark" ? "bg-[#121613]" : t.id === "light" ? "bg-[#ffffff]" : "bg-[linear-gradient(90deg,#121613_50%,#ffffff_50%)]"}`} />
            {tr(t.label)}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** The view switch on the start page (the same cookie as in Settings). */
export function ViewTabs({ value }: { value: View }) {
  const t = useT();
  const router = useRouter();
  return (
    <div role="group" aria-label={t("view.aria")} className="flex flex-wrap gap-1 rounded-lg border border-line bg-panel p-1">
      {VIEWS.map((x) => (
        <button key={x.id} type="button" aria-pressed={value === x.id} onClick={() => { document.cookie = prefCookie("view", x.id); router.refresh(); }}
          className="rounded-md px-3 py-1.5 font-display text-xs font-medium tracking-wide text-mute transition hover:text-ink aria-pressed:bg-accent-soft aria-pressed:text-accent-text">
          {t(x.label)}
        </button>
      ))}
    </div>
  );
}

/** E7f: the language of the interface; the cookie `lang` is read by the server, so the whole page re-renders in it. */
export function LangChoice({ value }: { value: Lang }) {
  const t = useT();
  const router = useRouter();
  const [v, setV] = useState(value);
  const pick = (x: Lang) => {
    setV(x);
    document.cookie = prefCookie("lang", x);
    document.documentElement.lang = x;
    router.refresh();
  };
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="sr-only">{t("settings.lang")}</legend>
      {LANG_CHOICES.map((x) => (
        <label key={x.id} lang={x.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line p-3 transition hover:bg-raised has-[:checked]:border-accent-text has-[:checked]:bg-accent-soft">
          <input type="radio" name="lang" value={x.id} checked={v === x.id} onChange={() => pick(x.id)} className="accent-[var(--accent)]" />
          <span className="text-sm font-medium">{t(x.label)}</span>
        </label>
      ))}
    </fieldset>
  );
}
