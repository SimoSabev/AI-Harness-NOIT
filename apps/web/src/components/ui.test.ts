import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Hex, SIGNAL, StatusBadge } from "./ui";
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
