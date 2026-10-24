import { describe, expect, it } from "vitest";
import { NAV, navActive } from "./nav";

describe("the side bar (D-384)", () => {
  it("has three sections: tasks, projects, settings", () => {
    expect(NAV.map((n) => [n.id, n.href])).toEqual([["tasks", "/"], ["projects", "/harness"], ["settings", "/settings"]]);
  });

  it("pages that left the bar light up the section they now live under", () => {
    expect(navActive("task")).toBe("tasks");
    expect(navActive("overview")).toBe("tasks");
    expect(navActive("harness")).toBe("projects");
    for (const p of ["keys", "system", "tools", "settings"] as const) expect(navActive(p)).toBe("settings");
    expect(navActive("login")).toBeNull();
  });
});
