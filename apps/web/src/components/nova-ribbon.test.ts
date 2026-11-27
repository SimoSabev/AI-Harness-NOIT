import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NovaRibbon } from "./nova-ribbon";
import { NOVA_START, novaReducer } from "../lib/nova-line";
import type { T } from "../i18n/t";

// D-599: the ribbon names what Nova does now; the star is the button that starts and stops her; opened, the card shows
// her steps and the last lines.
const t = Object.assign((k: string, p?: Record<string, unknown>) => (p ? `${k}(${String(p.target)})` : k), { lang: "en", n: (k: string) => k }) as unknown as T;
const noop = () => undefined;

describe("NovaRibbon (D-599)", () => {
  it("at rest it invites to talk and the star starts her", () => {
    const html = renderToStaticMarkup(createElement(NovaRibbon, { state: NOVA_START, t, open: false, onToggle: noop, live: false, onStar: noop }));
    expect(html).toContain('aria-label="voice.talk"');
    expect(html).toContain('data-phase="idle"');
    expect(html).toContain("nova.kind.idle");
    // D-712: on a phone at rest only the star shows (the words would cover the card under it)
    expect(html).toContain("max-sm:hidden");
  });
  it("acting, it says the verb and the target, never only thinking", () => {
    const s = novaReducer(novaReducer(NOVA_START, { type: "connecting" }), { type: "tool", key: "nova.act.press", params: { target: "Прати" }, at: 1 });
    const html = renderToStaticMarkup(createElement(NovaRibbon, { state: s, t, open: true, onToggle: noop, live: true, onStar: noop }));
    expect(html).toContain("nova.act.press(Прати)");
    expect(html).toContain('aria-label="voice.stop"');
    expect(html).toContain("nova.timeline");
    expect(html).toContain('data-phase="acting"');
    expect(html).not.toContain("max-sm:hidden");
  });
});
