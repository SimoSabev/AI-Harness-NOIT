import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectProfile } from "./project-profile";
import type { ChatTurn } from "@mandat/contract";
import type { T } from "../i18n/t";

// D-599: beside the interview the brief is written live: known parts with where they came from, the rest dashed.
const t = Object.assign((k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k), { lang: "en", n: (k: string) => k }) as unknown as T;
const at = "2026-11-24T10:00:00.000Z";

describe("ProjectProfile (D-599)", () => {
  it("shows the noted parts with their source, lands the fresh one and leaves the rest open", () => {
    const turns = [{ seq: 1, at, kind: "project_note", from: "code", parts: { stack: ["TypeScript"] } }, { seq: 2, at, kind: "project_note", from: "person", parts: { users: ["customers"] } }] as ChatTurn[];
    const html = renderToStaticMarkup(createElement(ProjectProfile, { turns, t }));
    expect(html).toContain("TypeScript");
    expect(html).toContain("customers");
    expect(html).toContain("interview.fromCode");
    expect(html).toContain("interview.fromYou");
    expect(html.match(/\bland\b/g)).toHaveLength(1);
    expect(html.match(/interview\.empty/g)).toHaveLength(6);
    expect(html).toContain("2/8");
  });
});
