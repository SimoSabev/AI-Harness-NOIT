import { DesktopCommand } from "@mandat/contract";
import { describe, expect, it } from "vitest";
import { QUICK_ENTRY, acceleratorLabel, shortcutMap, shortcutsText } from "./shortcuts.js";

// E9g A2 (AC-12.7): the keyboard map is one pure list; the File menu, the help box and main's registration read it.
describe("the keyboard map (AC-12.7)", () => {
  const map = shortcutMap();

  it("has only new task, approve and the global quick entry (D-384)", () => {
    const by = Object.fromEntries(map.map((s) => [s.id, s]));
    expect(map.map((s) => s.id)).toEqual(["new_task", "approve", "quick_entry"]);
    expect(by.new_task?.accelerator).toBe("CommandOrControl+N");
    expect(by.approve?.accelerator).toBe("CommandOrControl+Enter");
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
    expect(bg).toContain("Ctrl+N  Нова задача");
  });
});
