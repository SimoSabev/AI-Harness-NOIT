"use client";
import { createContext, useContext, useMemo } from "react";
import { translator } from "./t";
import type { Lang, T } from "./t";

// E7f: client components read the language the server chose (layout.tsx) from this context.
const LangContext = createContext<Lang>("en");

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useT(): T {
  const lang = useContext(LangContext);
  return useMemo(() => translator(lang), [lang]);
}
