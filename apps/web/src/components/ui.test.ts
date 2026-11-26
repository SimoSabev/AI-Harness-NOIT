import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hex, SIGNAL, StatusBadge, Tip } from "./ui";
import type { Tone } from "../lib/status";

// D-599: a status is a shape + a word + a colour (the Harnova brand kit), so it reads without colour vision: a diamond
// waits on you, a triangle is the agents working, a tick is proven, a cross failed, a dot is closed.
describe("signals (D-599)", () => {
  it("every tone has its own shape", () => {
    const tones: Tone[] = ["amber", "blue", "green", "red", "gray"];
    const shapes = tones.map((t) => SIGNAL[t].shape);
    expect(new Set(shapes).size).toBe(tones.length);
    expect(SIGNAL.amber.shape).toBe("sig-diamond");
    expect(SIGNAL.blue.shape).toBe("sig-run");
    expect(SIGNAL.green.shape).toBe("sig-tick");
    expect(SIGNAL.red.shape).toBe("sig-cross");
    expect(SIGNAL.gray.shape).toBe("sig-dot");
  });
  it("the badge carries the shape and the word, never the colour alone", () => {
    const html = renderToStaticMarkup(createElement(StatusBadge, { tone: "amber", label: "Чака теб" }));
    expect(html).toContain("sig-diamond");
    expect(html).toContain("Чака теб");
    expect(html).not.toContain("hex");
  });
  it("a mark without a tone is the accent diamond", () => {
    const html = renderToStaticMarkup(createElement(Hex, {}));
    expect(html).toContain("sig-diamond");
    expect(html).toContain("bg-accent");
  });
});

// D-631 (Simo 26.11.2026, "сега мога да драгвам UI-то"): the send button's tooltip hung 68px past the right edge of
// the window, so the whole page could be dragged sideways. Its tooltip opens above, aligned to the right; and the page
// itself never scrolls sideways whatever hangs out.
describe("nothing drags the page sideways (D-631)", () => {
  it("a tooltip at the right end opens above the control, aligned to its right edge", () => {
    const html = renderToStaticMarkup(createElement(Tip, { label: "Send", side: "top-end" }, createElement("button")));
    expect(html).toMatch(/class="tip [^"]*bottom-full[^"]*right-0/);
    expect(html).not.toContain("-translate-x-1/2");
  });
  it("the page clips what hangs out sideways instead of scrolling", () => {
    const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../app/globals.css"), "utf8");
    expect(css).toMatch(/html,\s*body\s*\{[^}]*overflow-x:\s*clip/);
  });
});
