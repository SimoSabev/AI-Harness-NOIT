import { describe, expect, it } from "vitest";
import { NAV, navActive, taskHref } from "./nav";

describe("the side bar (D-384)", () => {
  it("has four sections: tasks, research (D-398), projects, settings", () => {
    expect(NAV.map((n) => [n.id, n.href])).toEqual([["tasks", "/"], ["research", "/research"], ["projects", "/harness"], ["settings", "/settings"]]);
    expect(navActive("research")).toBe("research");
  });

  it("pages that left the bar light up the section they now live under", () => {
    expect(navActive("task")).toBe("tasks");
    expect(navActive("overview")).toBe("tasks");
    expect(navActive("harness")).toBe("projects");
    for (const p of ["keys", "system", "tools", "settings"] as const) expect(navActive(p)).toBe("settings");
    expect(navActive("login")).toBeNull();
  });
});

// D-386: one page per task — the tasks page with the task open.
describe("taskHref (D-386)", () => {
  it("every link to a task opens it on the tasks page", () => {
    expect(taskHref("t_ab_1")).toBe("/?task=t_ab_1");
  });
});
