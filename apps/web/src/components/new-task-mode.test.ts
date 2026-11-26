import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// D-630 (Simo 26.11.2026): no mode in the box. A task always starts as a conversation — the project's interview first
// (D-600), then the goal and the tests of the task — and only then work. There is no "Work right away".
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));
vi.mock("../i18n/client", () => ({ useT: () => Object.assign((k: string) => k, { lang: "en" }) }));
vi.mock("./second-factor", () => ({ useNeedsCode: () => false }));

const agents = [{ id: "claude@a", label: "Claude", models: ["m1"], defaultModel: "m1" }];
const projects = [{ id: "d0000000-0000-4000-8000-000000000001", full_name: "local/shop" }];

describe("the task box has no mode (D-630)", () => {
  it("no Ask first / Work right away switch, and no Start work before there is a conversation", async () => {
    const { NewTask } = await import("./workspace");
    const html = renderToStaticMarkup(createElement(NewTask, { agents, projects, canAct: true }));
    expect(html).not.toMatch(/chat\.askFirst(?!Hint)/);
    expect(html).not.toContain("chat.workNow");
    expect(html).not.toContain("chat.start");
    expect(html).toContain("chat.placeholder");
  });
});

// D-631: on a phone the two queues of the start page grew as wide as their longest title (one row of 42 873px), so the
// page dragged sideways. Their grid has a column that may shrink below its content.
describe("the start page fits a phone (D-631)", () => {
  it("the queues' grid has one shrinkable column on a narrow screen", async () => {
    const { NewTask } = await import("./workspace");
    const home = { stats: { waiting: 0, running: 0, projects: 1, noBrief: 0 }, say: { key: "home.say.calm" as const, params: { n: 0 } }, actions: [], queue: { counts: { waiting: 0, running: 0, done: 0 }, waiting: [], running: [] } };
    const html = renderToStaticMarkup(createElement(NewTask, { agents, projects, canAct: true, home }));
    expect(html).toContain("grid-cols-[minmax(0,1fr)]");
  });
});
