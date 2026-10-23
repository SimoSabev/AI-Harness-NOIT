// E7f (D-348): the catalog of the desktop window, same key style as apps/web/src/i18n. English is the source,
// Bulgarian the translation. The language: MANDAT_LANG (en|bg), else the system locale (app.getLocale()), else English.
export type Lang = "en" | "bg";

export const DESKTOP_EN = {
  "app.name": "Harness",
  "loading.starting": "The harness is starting…",
  "loading.check": "checking the computer",
  "error.ui": "The interface did not start: {error}",
  "error.start": "The harness did not start",
  "error.exit": "pnpm local exited with {code}",
  "tray.open": "Open",
  "tray.quit": "Stop and quit",
  "tray.waiting": "{count} waiting for you",
  "dialog.pickFolder": "Choose a project folder",
  "dialog.ok": "OK",
  "menu.file": "File",
  "menu.edit": "Edit",
  "menu.view": "View",
  "menu.window": "Window",
  "menu.help": "Help",
  "menu.keys": "Keys",
  "menu.projects": "Projects",
  "cmd.newTask": "New task",
  "cmd.addProject": "Add project…",
  "cmd.applyLocally": "Apply locally",
  "cmd.approve": "Approve",
  "cmd.search": "Search",
  "cmd.project": "Project {n}",
  "cmd.quickEntry": "Quick entry (from anywhere)",
  "view.inbox": "Inbox",
  "view.board": "Board",
  "view.agents": "Agents",
  "view.tools": "Tools",
  "view.night": "Night shift",
  "view.research": "Research",
  "help.shortcuts": "Keyboard shortcuts",
  "help.about": "About {name}",
  "tray.startAtLogin": "Start at login",
  "tray.nothingWaiting": "Nothing waiting for you",
  "notify.waiting": "Waiting for you",
  "notify.waitingMany": "{count} tasks are waiting for you",
  "grant.title": "Give the harness access to this folder?",
  "grant.detail": "{path}\n\nWhat it may do there:\n{scopes}\n\nThe AI agent in the sandbox gets none of this. You can take it back in Settings → Local access.",
  "grant.allow": "Allow",
  "grant.cancel": "Cancel",
  "scope.read": "Read — the folder may become a project",
  "scope.apply": "Apply locally — bring a verified change into this working copy (fast-forward only)",
  "scope.open_editor": "Open in editor — open files of a change in your editor",
  "scope.terminal": "Terminal — a terminal on this computer, not the sandbox",
  "refuse.missing": "The folder does not exist.",
  "refuse.not_a_folder": "This is a file, not a folder.",
  "refuse.root": "The whole disk cannot be granted. Choose a project folder.",
  "refuse.home": "Your whole home folder cannot be granted. Choose a project folder inside it.",
  "refuse.system": "System folders cannot be granted.",
  "refuse.secrets": "Folders with credentials or app data cannot be granted.",
  "refuse.profile": "The harness's own profile folder cannot be granted.",
  "refuse.not_granted": "This path is not inside a folder you granted.",
  "refuse.no_scope": "The folder is granted, but not for this action.",
  "refuse.cancelled": "Not granted.",
  "refuse.editor": "The editor could not be opened.",
  "refuse.broken": "The local access file could not be read, so nothing is granted. Grant the folders again.",
} as const;

export type DesktopKey = keyof typeof DESKTOP_EN;

export const DESKTOP_BG: Record<DesktopKey, string> = {
  "app.name": "Харнес",
  "loading.starting": "Харнесът се пуска…",
  "loading.check": "проверка на компютъра",
  "error.ui": "Интерфейсът не тръгна: {error}",
  "error.start": "Харнесът не тръгна",
  "error.exit": "pnpm local излезе с {code}",
  "tray.open": "Отвори",
  "tray.quit": "Спри и излез",
  "tray.waiting": "{count} чакат теб",
  "dialog.pickFolder": "Избери папка на проекта",
  "dialog.ok": "Добре",
  "menu.file": "Файл",
  "menu.edit": "Редакция",
  "menu.view": "Изглед",
  "menu.window": "Прозорец",
  "menu.help": "Помощ",
  "menu.keys": "Клавиши",
  "menu.projects": "Проекти",
  "cmd.newTask": "Нова задача",
  "cmd.addProject": "Добави проект…",
  "cmd.applyLocally": "Приложи локално",
  "cmd.approve": "Одобри",
  "cmd.search": "Търсене",
  "cmd.project": "Проект {n}",
  "cmd.quickEntry": "Бързо въвеждане (отвсякъде)",
  "view.inbox": "Входящи",
  "view.board": "Дъска",
  "view.agents": "Агенти",
  "view.tools": "Инструменти",
  "view.night": "Нощна смяна",
  "view.research": "Ресърч",
  "help.shortcuts": "Клавишни комбинации",
  "help.about": "За {name}",
  "tray.startAtLogin": "Стартирай при вход",
  "tray.nothingWaiting": "Нищо не чака теб",
  "notify.waiting": "Чака теб",
  "notify.waitingMany": "{count} задачи чакат теб",
  "grant.title": "Да има ли харнесът достъп до тази папка?",
  "grant.detail": "{path}\n\nКакво може да прави там:\n{scopes}\n\nAI агентът в пясъчника не получава нищо от това. Можеш да го отнемеш в Настройки → Локален достъп.",
  "grant.allow": "Разреши",
  "grant.cancel": "Отказ",
  "scope.read": "Четене — папката може да стане проект",
  "scope.apply": "Приложи локално — внася проверена промяна в това работно копие (само fast-forward)",
  "scope.open_editor": "Отвори в редактора — файловете на промяната в твоя редактор",
  "scope.terminal": "Терминал — терминал на този компютър, не в пясъчника",
  "refuse.missing": "Папката не съществува.",
  "refuse.not_a_folder": "Това е файл, не папка.",
  "refuse.root": "Целият диск не може да се даде. Избери папка на проект.",
  "refuse.home": "Цялата домашна папка не може да се даде. Избери папка на проект в нея.",
  "refuse.system": "Системни папки не могат да се дадат.",
  "refuse.secrets": "Папки с идентификационни данни или данни на приложения не могат да се дадат.",
  "refuse.profile": "Профилната папка на самия харнес не може да се даде.",
  "refuse.not_granted": "Този път не е в папка, която си дал.",
  "refuse.no_scope": "Папката е дадена, но не за това действие.",
  "refuse.cancelled": "Не е разрешено.",
  "refuse.editor": "Редакторът не се отвори.",
  "refuse.broken": "Файлът с локалния достъп не се прочете, затова нищо не е разрешено. Дай папките отново.",
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
