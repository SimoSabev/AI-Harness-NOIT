import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TaskPath } from "./task-path";
import type { T } from "../i18n/t";
import type { Stop } from "../lib/task-path";

// D-599: the strap shows the five stops with their state in words (for screen readers) and one fact under each.
const t = Object.assign((k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k), { lang: "en", n: (k: string) => k }) as unknown as T;
const stops: Stop[] = [
  { id: "conversation", label: "path.conversation", state: "done" },
  { id: "spec", label: "path.spec", state: "done" },
  { id: "oracle", label: "path.oracle", state: "you", count: { n: 22 } },
  { id: "work", label: "path.work", state: "todo" },
  { id: "seal", label: "path.seal", state: "todo" },
];

describe("TaskPath (D-599)", () => {
  it("the full strap names every stop, marks the one that waits on you and shows its fact", () => {
    const html = renderToStaticMarkup(createElement(TaskPath, { stops, t }));
    for (const s of stops) expect(html).toContain(s.label);
    expect(html).toContain('aria-current="step"');
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain("path.tests:{&quot;n&quot;:22}");
    expect(html).toContain("path.state.you");
  });
  it("the mini strap says every stop and its state in its label", () => {
    const html = renderToStaticMarkup(createElement(TaskPath, { stops, t, compact: true }));
    expect(html).toContain('role="img"');
    expect(html).toContain("path.oracle: path.state.you");
  });
});
