// E7f (D-348): the catalog of the desktop window, same key style as apps/web/src/i18n. English is the source,
// Bulgarian the translation. The language: MANDAT_LANG (en|bg), else the system locale (app.getLocale()), else English.
export type Lang = "en" | "bg";

export const DESKTOP_EN = {
  "app.name": "Harness",
  "loading.starting": "The harness is starting…",
  "loading.check": "checking the computer",
  "totp.title": "Two-factor code",
  "totp.message": "Add this key to an authenticator app (Google Authenticator, 1Password…). It is shown only now.",
  "totp.button": "I added it",
  "error.ui": "The interface did not start: {error}",
  "error.start": "The harness did not start",
  "error.exit": "pnpm local exited with {code}",
  "tray.open": "Open",
  "tray.quit": "Stop and quit",
} as const;

export type DesktopKey = keyof typeof DESKTOP_EN;

export const DESKTOP_BG: Record<DesktopKey, string> = {
  "app.name": "Харнес",
  "loading.starting": "Харнесът се пуска…",
  "loading.check": "проверка на компютъра",
  "totp.title": "Двуфакторен код",
  "totp.message": "Добави този ключ в приложение за кодове (Google Authenticator, 1Password…). Показва се само сега.",
  "totp.button": "Добавих го",
  "error.ui": "Интерфейсът не тръгна: {error}",
  "error.start": "Харнесът не тръгна",
  "error.exit": "pnpm local излезе с {code}",
  "tray.open": "Отвори",
  "tray.quit": "Спри и излез",
};

const CATALOG: Record<Lang, Record<DesktopKey, string>> = { en: DESKTOP_EN, bg: DESKTOP_BG };

export function desktopLang(env: Record<string, string | undefined>, systemLocale: string): Lang {
  const chosen = env.MANDAT_LANG?.trim().toLowerCase();
  if (chosen === "en" || chosen === "bg") return chosen;
  return /^bg([_.-]|$)/i.test(systemLocale) ? "bg" : "en";
}

export function dt(lang: Lang, key: DesktopKey, params?: Record<string, string | number>): string {
  const s = CATALOG[lang][key];
  return params ? s.replace(/\{(\w+)\}/g, (m, name: string) => (params[name] === undefined ? m : String(params[name]))) : s;
}

/** The page shown while `pnpm local` starts (a data: URL), in the chosen language. */
export function loadingPage(lang: Lang): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(
    `<!doctype html><html lang="${lang}"><meta charset="utf-8"><title>${dt(lang, "app.name")}</title><body style="font:15px system-ui;margin:0;display:grid;place-items:center;height:100vh;background:#fafafa;color:#18181b"><div><b>${dt(lang, "loading.starting")}</b><p id="s" style="color:#52525b">${dt(lang, "loading.check")}</p></div>`,
  )}`;
}
