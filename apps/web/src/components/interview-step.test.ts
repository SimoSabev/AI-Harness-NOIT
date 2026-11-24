import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InterviewStep } from "./interview-step";
import type { T } from "../i18n/t";

// D-600: the first question is large, its answers are cards with numbers, "Other…" is always there; a question
// without answers is a text box.
const t = Object.assign((k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k), { lang: "en", n: (k: string) => k }) as unknown as T;
const noop = () => undefined;

describe("InterviewStep (D-600)", () => {
  it("shows one question large, its answers to pick and Other", () => {
    const html = renderToStaticMarkup(createElement(InterviewStep, { questions: [{ text: "Кой ползва магазина?", options: ["Клиенти", "Персонал"], multi: true }, { text: "Таван?", options: [], multi: false }], t, busy: false, onSend: noop }));
    expect(html).toContain("<h2");
    expect(html).toContain("Кой ползва магазина?");
    expect(html).not.toContain("Таван?");
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
    expect(html).toContain("interview.other");
    expect(html).toContain("interview.pickMany");
    expect(html).toContain("interview.next");
  });
  it("a question without answers is a text box and the last step sends", () => {
    const html = renderToStaticMarkup(createElement(InterviewStep, { questions: [{ text: "Нещо друго?", options: [], multi: false }], t, busy: false, onSend: noop }));
    expect(html).toContain("<textarea");
    expect(html).toContain("interview.send");
  });
});
