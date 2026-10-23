import { describe, expect, it } from "vitest";
import { allowedUrl, childEnv, isErrorLine, parseBanner, stepOf } from "./banner.js";

const BANNER = [
  "",
  "  Харнесът работи локално (съдия: Мандат)",
  "  Отвори:  http://localhost:3000",
  "  Вход:    без вход — само от този компютър",
  "",
].join("\n");

describe("desktop banner (D-303, D-368)", () => {
  it("само адресът от банера на pnpm local (без вход); без адрес или с чужд адрес → null", () => {
    expect(parseBanner(BANNER)).toEqual({ url: "http://localhost:3000" });
    expect(parseBanner("  Харнесът работи локално\n")).toBeNull();
    expect(parseBanner(BANNER.replace("http://localhost:3000", "https://evil.example"))).toBeNull();
    expect(parseBanner(BANNER.replace("http://localhost:3000", "http://192.168.1.5:3000"))).toBeNull();
  });

  it("the English banner (E7е) gives the same address", () => {
    expect(parseBanner(BANNER.replace("Отвори:", "Open:   "))).toEqual(parseBanner(BANNER));
  });

  it("error lines of pnpm local in either language", () => {
    expect(isErrorLine("✗ Docker не отговаря")).toBe(true);
    expect(isErrorLine("Error: listen EADDRINUSE")).toBe(true);
    expect(isErrorLine("[2/4] database")).toBe(false);
  });

  it("стъпките [n/4] за прозореца при пускане", () => {
    expect(stepOf("[3/4] образи на пясъчника")).toEqual({ n: 3, of: 4, text: "образи на пясъчника" });
    expect(stepOf("база: приложено x.sql")).toBeNull();
  });

  it("env на детето без API ключове и без ELECTRON_RUN_AS_NODE", () => {
    expect(childEnv({ PATH: "/bin", ANTHROPIC_API_KEY: "x", OPENAI_API_KEY: "y", ELECTRON_RUN_AS_NODE: "1" })).toEqual({ PATH: "/bin" });
  });

  it("навигация само в локалния адрес", () => {
    expect(allowedUrl("http://localhost:3000/tasks/t_1", "http://localhost:3000")).toBe(true);
    expect(allowedUrl("http://localhost:3001/", "http://localhost:3000")).toBe(false);
    expect(allowedUrl("https://example.com/", "http://localhost:3000")).toBe(false);
    expect(allowedUrl("not a url", "http://localhost:3000")).toBe(false);
  });
});
