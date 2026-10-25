// E7f (D-348): the catalog of the terminal UI (`mandat tui`), same key style as apps/web/src/i18n. English is the
// source, Bulgarian the translation. The language: MANDAT_LANG (en|bg), else the system locale (LC_ALL, LC_MESSAGES,
// LANG: bg_* → Bulgarian), else English.
export type Lang = "en" | "bg";

export const TUI_EN = {
  "tui.flow.tasks": "tasks",
  "tui.flow.agents": "agents",
  "tui.flow.mandat": "mandat",
  "tui.flow.you": "you",
  "tui.flow.done": "done",
  "tui.noAgents": "no live agents",
  "tui.empty": "No tasks yet.",
  "tui.emptyHint": "Give a task in the browser (http://localhost:3000/tasks/new) or with mandat run.",
  "tui.state.1": "queue",
  "tui.state.2": "working",
  "tui.state.3": "mandat",
  "tui.state.4": "WAITING FOR YOU",
  "tui.state.5": "FAILED",
  "tui.health.bad": "FAILED",
  "tui.health.warn": "waiting for you",
  "tui.health.ok": "running",
  "tui.health.idle": "quiet",
  "tui.done24h": "{n} done in 24 h",
  "tui.keys": " 1-6 pane · tab next · o browser · r refresh · q quit",
  "tui.dbDown": "tui: the database does not answer. Run `pnpm local` first.",
} as const;

export type TuiKey = keyof typeof TUI_EN;

export const TUI_BG: Record<TuiKey, string> = {
  "tui.flow.tasks": "задачи",
  "tui.flow.agents": "агенти",
  "tui.flow.mandat": "мандат",
  "tui.flow.you": "ти",
  "tui.flow.done": "готово",
  "tui.noAgents": "няма живи агенти",
  "tui.empty": "Още няма задачи.",
  "tui.emptyHint": "Дай задача в браузъра (http://localhost:3000/tasks/new) или с mandat run.",
  "tui.state.1": "опашка",
  "tui.state.2": "работи",
  "tui.state.3": "мандат",
  "tui.state.4": "ЧАКА ТЕБ",
  "tui.state.5": "ПРОВАЛ",
  "tui.health.bad": "ПРОВАЛ",
  "tui.health.warn": "чака теб",
  "tui.health.ok": "върви",
  "tui.health.idle": "тихо",
  "tui.done24h": "{n} готови за 24 ч",
  "tui.keys": " 1-6 панел · tab следващ · o браузър · r обнови · q изход",
  "tui.dbDown": "tui: базата не отговаря. Пусни първо `pnpm local`.",
};

const CATALOG: Record<Lang, Record<TuiKey, string>> = { en: TUI_EN, bg: TUI_BG };

export function cliLang(env: Record<string, string | undefined>): Lang {
  const chosen = env.MANDAT_LANG?.trim().toLowerCase();
  if (chosen === "en" || chosen === "bg") return chosen;
  const locale = [env.LC_ALL, env.LC_MESSAGES, env.LANG].find((v) => v !== undefined && v.trim() !== "") ?? "";
  return /^bg([_.-]|$)/i.test(locale) ? "bg" : "en";
}

export function tt(lang: Lang, key: TuiKey, params?: Record<string, string | number>): string {
  const s = CATALOG[lang][key];
  return params ? s.replace(/\{(\w+)\}/g, (m, name: string) => (params[name] === undefined ? m : String(params[name]))) : s;
}
