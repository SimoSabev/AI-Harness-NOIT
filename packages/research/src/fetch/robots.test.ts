import { describe, expect, it } from "vitest";
import { parseRobots } from "./robots.js";

const txt = `
User-agent: *
Disallow: /private/
Allow: /private/ok.html
Disallow: /*.pdf$
Crawl-delay: 2

User-agent: GPTBot
User-agent: MandatResearch
Disallow: /no-bots/
`;

describe("robots.txt (RFC 9309)", () => {
  it("our own group wins over *", () => {
    const r = parseRobots(txt, "MandatResearch");
    expect(r.allowed("/no-bots/x")).toBe(false);
    expect(r.allowed("/private/x")).toBe(true);
    expect(r.crawlDelay).toBeNull();
  });
  it("* group: longest match, Allow wins a tie, * and $ patterns", () => {
    const r = parseRobots(txt, "SomeOtherBot");
    expect(r.allowed("/private/x")).toBe(false);
    expect(r.allowed("/private/ok.html")).toBe(true);
    expect(r.allowed("/docs/a.pdf")).toBe(false);
    expect(r.allowed("/docs/a.pdf?x=1")).toBe(true);
    expect(r.allowed("/")).toBe(true);
    expect(r.crawlDelay).toBe(2);
  });
  it("empty Disallow allows everything; comments are ignored", () => {
    expect(parseRobots("User-agent: * # all\nDisallow:\n", "x").allowed("/a")).toBe(true);
  });
});
