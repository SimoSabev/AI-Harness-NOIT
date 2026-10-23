import { DesktopCommand } from "@mandat/contract";
import { describe, expect, it } from "vitest";
import { QUICK_ENTRY, acceleratorLabel, shortcutMap, shortcutsText } from "./shortcuts.js";

// E9g A2 (AC-12.7): the keyboard map is one pure list; the "Keys" menu, the help box and main's registration read it.
describe("the keyboard map (AC-12.7)", () => {
  const map = shortcutMap();

  it("has new task, approve, search, projects 1..9 and the global quick entry", () => {
    const by = Object.fromEntries(map.map((s) => [s.id, s]));
    expect(by.new_task?.accelerator).toBe("CommandOrControl+N");
    expect(by.approve?.accelerator).toBe("CommandOrControl+Enter");
    expect(by.search?.accelerator).toBe("CommandOrControl+K");
    for (let n = 1; n <= 9; n++) expect(by[`project_${n}`]).toMatchObject({ accelerator: `CommandOrControl+${n}`, command: { command: "open_project", index: n } });
    expect(by.quick_entry).toMatchObject({ accelerator: QUICK_ENTRY, global: true, command: { command: "new_task" } });
    expect(QUICK_ENTRY).toBe("CommandOrControl+Shift+Space");
    expect(map.filter((s) => s.global).map((s) => s.id)).toEqual(["quick_entry"]);
  });

  it("every command is a valid DesktopCommand, every accelerator is unique", () => {
    for (const s of map) expect(DesktopCommand.safeParse(s.command).success, s.id).toBe(true);
    const accels = map.map((s) => s.accelerator);
    expect(new Set(accels).size).toBe(accels.length);
    expect(new Set(map.map((s) => s.id)).size).toBe(map.length);
  });

  it("approve goes to the web as the approve command: the web's own confirm (+ TOTP) decides, never main", () => {
    expect(map.find((s) => s.id === "approve")?.command).toEqual({ command: "approve" });
  });

  it("labels follow the platform: ⌘ on macOS, Ctrl elsewhere", () => {
    expect(acceleratorLabel("CommandOrControl+N", "darwin")).toBe("⌘N");
    expect(acceleratorLabel("CommandOrControl+Enter", "darwin")).toBe("⌘↩");
    expect(acceleratorLabel("CommandOrControl+Shift+Space", "darwin")).toBe("⇧⌘Space");
    expect(acceleratorLabel("CommandOrControl+N", "win32")).toBe("Ctrl+N");
    expect(acceleratorLabel("CommandOrControl+Shift+Space", "linux")).toBe("Ctrl+Shift+Space");
    expect(acceleratorLabel("CommandOrControl+Enter", "linux")).toBe("Ctrl+Enter");
  });

  it("the help text lists every shortcut in the chosen language", () => {
    const en = shortcutsText("en", "darwin");
    const bg = shortcutsText("bg", "linux");
    expect(en.split("\n")).toHaveLength(map.length);
    expect(en).toContain("⌘N  New task");
    expect(en).toContain("⇧⌘Space  Quick entry (from anywhere)");
    expect(bg).toContain("Ctrl+K  Търсене");
    expect(bg).toContain("Ctrl+9  Проект 9");
  });
});
