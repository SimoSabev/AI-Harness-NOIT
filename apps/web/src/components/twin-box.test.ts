import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TwinView } from "../lib/twin-view";

// D-523, live test (16.11.2026): a page whose scripts went stale (the server restarted) submits the offer as a plain
// form to "/", and the person lost the task. The form now carries the task, so a plain submit lands on the same task.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("../i18n/client", () => ({ useT: () => Object.assign((k: string) => k, { lang: "en" }) }));
vi.mock("./second-factor", () => ({ useNeedsCode: () => false }));

const twin: TwinView = { class_key: "k", predicted: "approved", p: 1, n: 12, scored: 11, correct: 11, offer: true, rule: null, by_twin: false, policy: true };

describe("TwinBox without scripts (D-523)", () => {
  it("the offer form keeps the task when it is submitted as a plain form", async () => {
    const { TwinBox } = await import("./twin-box");
    const html = renderToStaticMarkup(createElement(TwinBox, { twin, canAct: true, waiting: true, taskId: "t_abc" }));
    expect(html).toContain("twin.yes");
    expect(html).toMatch(/<input type="hidden" name="task" value="t_abc"\/>/);
  });
});
