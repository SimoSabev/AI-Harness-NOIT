import type { DesktopCommand, DesktopView } from "@mandat/contract";
import type { MenuItemConstructorOptions } from "electron";
import { dt } from "./i18n.js";
import type { DesktopKey, Lang } from "./i18n.js";
import { shortcutMap } from "./shortcuts.js";

// E9g A2 (AC-12.5, AC-12.7): the native menus as plain data, pure (no Electron import) so they are tested as is. An item
// either sends a DesktopCommand to the web (main → harness:event), runs a main-side action, or is an Electron role.
// D-384: no Keys menu — the window shortcuts sit on their File items (each exactly once), Help lists them all, and the
// global quick entry is registered only through globalShortcut.

export type MenuAction = "open" | "quit" | "toggle_login" | "show_shortcuts";

/** The Electron menu roles these menus use (names as in MenuItemConstructorOptions["role"], Electron 44). */
export type MenuRole = "about" | "hide" | "hideOthers" | "unhide" | "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll" | "reload" | "resetZoom" | "zoomIn" | "zoomOut" | "togglefullscreen" | "minimize" | "zoom" | "front" | "close";

export type MenuSpec =
  | { type: "separator" }
  | { role: MenuRole; label?: string; submenu?: MenuSpec[] }
  | { label: string; accelerator?: string; command?: DesktopCommand; action?: MenuAction; type?: "checkbox"; checked?: boolean; enabled?: boolean; submenu?: MenuSpec[] };

export interface AppMenuOptions {
  appName: string;
  /** the OS login item: null where Electron does not support it (Linux), else whether it is on */
  loginItem: boolean | null;
}

const SEP: MenuSpec = { type: "separator" };
const VIEWS: { view: DesktopView; label: DesktopKey }[] = [
  { view: "tasks", label: "view.tasks" },
  { view: "projects", label: "view.projects" },
  { view: "memory", label: "view.memory" },
  { view: "settings", label: "view.settings" },
];

function loginItem(lang: Lang, on: boolean | null): MenuSpec[] {
  return on === null ? [] : [{ label: dt(lang, "tray.startAtLogin"), type: "checkbox", checked: on, action: "toggle_login" }];
}

/** A File item with its window shortcut, when it has one. */
function fileItem(lang: Lang, id: string, label: DesktopKey, command: DesktopCommand): MenuSpec {
  const accelerator = shortcutMap().find((s) => s.id === id && !s.global)?.accelerator;
  return { label: dt(lang, label), command, ...(accelerator ? { accelerator } : {}) };
}

export function appMenu(lang: Lang, platform: string, o: AppMenuOptions): MenuSpec[] {
  const mac = platform === "darwin";
  const quit: MenuSpec = { label: dt(lang, "tray.quit"), action: "quit" };
  const about: MenuSpec = { role: "about", label: dt(lang, "help.about", { name: o.appName }) };
  const appItems: MenuSpec[] = mac
    ? [{ label: o.appName, submenu: [about, SEP, ...loginItem(lang, o.loginItem), ...(o.loginItem === null ? [] : [SEP]), { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, SEP, quit] }]
    : [];
  return [
    ...appItems,
    {
      label: dt(lang, "menu.file"),
      submenu: [
        fileItem(lang, "new_task", "cmd.newTask", { command: "new_task" }),
        fileItem(lang, "approve", "cmd.approve", { command: "approve" }),
        SEP,
        { label: dt(lang, "cmd.addProject"), command: { command: "add_project" } },
        { label: dt(lang, "cmd.applyLocally"), command: { command: "apply_locally" } },
        ...(mac ? [] : [SEP, ...loginItem(lang, o.loginItem), ...(o.loginItem === null ? [] : [SEP]), quit]),
      ],
    },
    { label: dt(lang, "menu.edit"), submenu: [{ role: "undo" }, { role: "redo" }, SEP, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    {
      label: dt(lang, "menu.view"),
      submenu: [...VIEWS.map((v): MenuSpec => ({ label: dt(lang, v.label), command: { command: "view", view: v.view } })), SEP, { role: "reload" }, SEP, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, SEP, { role: "togglefullscreen" }],
    },
    { label: dt(lang, "menu.window"), submenu: mac ? [{ role: "minimize" }, { role: "zoom" }, SEP, { role: "front" }] : [{ role: "minimize" }, { role: "close" }] },
    { label: dt(lang, "menu.help"), submenu: [{ label: dt(lang, "help.shortcuts"), action: "show_shortcuts" }, ...(mac ? [] : [SEP, about])] },
  ];
}

export function trayMenu(lang: Lang, o: { waiting: number; loginItem: boolean | null }): MenuSpec[] {
  const waiting = o.waiting > 0 ? dt(lang, "tray.waiting", { count: o.waiting }) : dt(lang, "tray.nothingWaiting");
  return [
    { label: dt(lang, "tray.open"), action: "open" },
    { label: waiting, command: { command: "view", view: "tasks" } },
    SEP,
    ...loginItem(lang, o.loginItem),
    ...(o.loginItem === null ? [] : [SEP]),
    { label: dt(lang, "tray.quit"), action: "quit" },
  ];
}

/** The tray tooltip, and the text next to the menubar icon on macOS (null: the platform has none). */
export function trayState(lang: Lang, count: number, platform: string): { tooltip: string; title: string | null } {
  const name = dt(lang, "app.name");
  return {
    tooltip: count > 0 ? `${name} — ${dt(lang, "tray.waiting", { count })}` : name,
    title: platform === "darwin" ? (count > 0 ? String(count) : "") : null,
  };
}

/** MenuSpec → the Electron template: a command goes to the web, an action to main; roles and accelerators as they are. */
export function toTemplate(items: readonly MenuSpec[], onCommand: (c: DesktopCommand) => void, onAction: (a: MenuAction) => void): MenuItemConstructorOptions[] {
  return items.map((i): MenuItemConstructorOptions => {
    if ("type" in i && i.type === "separator") return { type: "separator" };
    if ("role" in i) return { role: i.role, ...(i.label ? { label: i.label } : {}), ...(i.submenu ? { submenu: toTemplate(i.submenu, onCommand, onAction) } : {}) };
    const out: MenuItemConstructorOptions = { label: i.label };
    if (i.accelerator) out.accelerator = i.accelerator;
    if (i.type === "checkbox") {
      out.type = "checkbox";
      out.checked = i.checked === true;
    }
    if (i.enabled === false) out.enabled = false;
    if (i.submenu) out.submenu = toTemplate(i.submenu, onCommand, onAction);
    const { command, action } = i;
    if (command) out.click = () => onCommand(command);
    else if (action) out.click = () => onAction(action);
    return out;
  });
}
