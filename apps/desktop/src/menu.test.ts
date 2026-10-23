import { DesktopCommand } from "@mandat/contract";
import { describe, expect, it } from "vitest";
import { appMenu, toTemplate, trayMenu, trayState } from "./menu.js";
import type { MenuSpec } from "./menu.js";
import { shortcutMap } from "./shortcuts.js";

// E9g A2 (AC-12.5, AC-12.7): the native menus as plain data; main only turns them into Electron menus.
const flat = (items: readonly MenuSpec[]): MenuSpec[] => items.flatMap((i) => [i, ...("submenu" in i && i.submenu ? flat(i.submenu) : [])]);
const labelOf = (i: MenuSpec): string | undefined => ("label" in i ? i.label : undefined);
const top = (m: readonly MenuSpec[]) => m.map(labelOf);

describe("the application menu (AC-12.7)", () => {
  it("macOS: app, File, Edit, View, Keys, Window, Help; elsewhere without the app menu", () => {
    expect(top(appMenu("en", "darwin", { appName: "Harness", loginItem: false }))).toEqual(["Harness", "File", "Edit", "View", "Keys", "Window", "Help"]);
    expect(top(appMenu("en", "linux", { appName: "Harness", loginItem: null }))).toEqual(["File", "Edit", "View", "Keys", "Window", "Help"]);
    expect(top(appMenu("bg", "win32", { appName: "Харнес", loginItem: false }))).toEqual(["Файл", "Редакция", "Изглед", "Клавиши", "Прозорец", "Помощ"]);
  });

  it("File has New task, Add project, Apply locally; View has the six screens", () => {
    const m = appMenu("en", "darwin", { appName: "Harness", loginItem: false });
    const file = m.find((i) => labelOf(i) === "File");
    const cmds = (i: MenuSpec | undefined) => flat(i && "submenu" in i && i.submenu ? i.submenu : []).flatMap((x) => ("command" in x && x.command ? [x.command] : []));
    expect(cmds(file)).toEqual([{ command: "new_task" }, { command: "add_project" }, { command: "apply_locally" }]);
    const view = m.find((i) => labelOf(i) === "View");
    expect(cmds(view).map((c) => (c.command === "view" ? c.view : c.command))).toEqual(["inbox", "board", "agents", "tools", "night", "research"]);
  });

  it("Edit is built from roles, so copy and paste work in the window", () => {
    const m = appMenu("en", "darwin", { appName: "Harness", loginItem: false });
    const edit = m.find((i) => labelOf(i) === "Edit");
    const roles = flat(edit && "submenu" in edit && edit.submenu ? edit.submenu : []).flatMap((x) => ("role" in x ? [x.role] : []));
    for (const r of ["undo", "redo", "cut", "copy", "paste", "selectAll"]) expect(roles).toContain(r);
  });

  it("the Keys menu lists every shortcut; each window shortcut is registered exactly once in the whole menu", () => {
    for (const platform of ["darwin", "linux", "win32"]) {
      const m = appMenu("en", platform, { appName: "Harness", loginItem: false });
      const keys = m.find((i) => labelOf(i) === "Keys");
      const inKeys = flat(keys && "submenu" in keys && keys.submenu ? keys.submenu : []).map(labelOf).join("\n");
      for (const s of shortcutMap()) expect(inKeys, s.id).toContain(s.id === "quick_entry" ? "Quick entry" : s.label === "cmd.project" ? `Project ${s.params?.n}` : "");
      const accels = flat(m).flatMap((i) => ("accelerator" in i && i.accelerator ? [i.accelerator] : []));
      for (const s of shortcutMap().filter((x) => !x.global)) expect(accels.filter((a) => a === s.accelerator), s.id).toHaveLength(1);
      expect(accels).not.toContain("CommandOrControl+Shift+Space"); // the global one is registered by globalShortcut only
    }
  });

  it("every command in the menus is a valid DesktopCommand; no item has both a command and an action", () => {
    const all = [...flat(appMenu("en", "darwin", { appName: "Harness", loginItem: true })), ...flat(trayMenu("en", { waiting: 2, loginItem: true }))];
    for (const i of all) {
      if ("command" in i && i.command) expect(DesktopCommand.safeParse(i.command).success).toBe(true);
      expect("command" in i && i.command && "action" in i && i.action).toBeFalsy();
    }
  });

  it("Start at login is a checkbox, shown only where the OS supports it, and reflects the setting (off by default)", () => {
    const find = (m: readonly MenuSpec[]) => flat(m).find((i) => "action" in i && i.action === "toggle_login");
    expect(find(appMenu("en", "darwin", { appName: "Harness", loginItem: false }))).toMatchObject({ type: "checkbox", checked: false, label: "Start at login" });
    expect(find(appMenu("en", "linux", { appName: "Harness", loginItem: null }))).toBeUndefined();
    expect(find(trayMenu("en", { waiting: 0, loginItem: true }))).toMatchObject({ checked: true });
    expect(find(trayMenu("en", { waiting: 0, loginItem: null }))).toBeUndefined();
  });
});

describe("the tray (AC-12.5)", () => {
  it("shows the waiting counter; a click on it opens the inbox", () => {
    const m = trayMenu("en", { waiting: 3, loginItem: false });
    expect(m.map(labelOf)).toContain("3 waiting for you");
    expect(flat(m).find((i) => labelOf(i) === "3 waiting for you")).toMatchObject({ command: { command: "view", view: "inbox" } });
    expect(trayMenu("bg", { waiting: 0, loginItem: false }).map(labelOf)).toContain("Нищо не чака теб");
    expect(flat(m).some((i) => "action" in i && i.action === "quit")).toBe(true);
  });

  it("the tooltip and the macOS menubar title carry the count; nothing when zero", () => {
    expect(trayState("en", 2, "darwin")).toEqual({ tooltip: "Harness — 2 waiting for you", title: "2" });
    expect(trayState("en", 0, "darwin")).toEqual({ tooltip: "Harness", title: "" });
    expect(trayState("bg", 5, "linux")).toEqual({ tooltip: "Харнес — 5 чакат теб", title: null });
  });
});

describe("toTemplate", () => {
  it("keeps roles, accelerators and checkboxes; a click sends the command or runs the action", () => {
    const sent: unknown[] = [];
    const t = toTemplate(appMenu("en", "darwin", { appName: "Harness", loginItem: true }), (c) => sent.push(c), (a) => sent.push(a));
    const all = (xs: typeof t): typeof t => xs.flatMap((x) => [x, ...(Array.isArray(x.submenu) ? all(x.submenu) : [])]);
    const items = all(t);
    expect(items.find((x) => x.role === "copy")).toBeDefined();
    const newTask = items.find((x) => x.accelerator === "CommandOrControl+N");
    const login = items.find((x) => x.type === "checkbox");
    expect(login?.checked).toBe(true);
    // the click handlers ignore Electron's arguments
    (newTask?.click as () => void)();
    (login?.click as () => void)();
    expect(sent).toEqual([{ command: "new_task" }, "toggle_login"]);
    expect(items.filter((x) => x.type === "separator").length).toBeGreaterThan(0);
  });
});
