import { describe, expect, it } from "vitest";
import { allowedUrl, childEnv, isErrorLine, loginScript, parseBanner, stepOf } from "./banner.js";

const BANNER = [
  "",
  "  Харнесът работи локално (съдия: Мандат)",
  "  Отвори:  http://localhost:3000",
  "  Имейл:   ti@mandat.local",
  "  Парола:  Ab3_x-9   (нова при всяко пускане)",
  "",
  "  Двуфакторен код (само сега): добави в приложение за кодове (Google Authenticator, 1Password…)",
  "  Ключ:    ABCDEFGHIJKLMNOP",
  "  Адрес:   otpauth://totp/Mandat:ti%40mandat.local?secret=ABCDEFGHIJKLMNOP&issuer=Mandat&algorithm=SHA1&digits=6&period=30",
  "",
].join("\n");

describe("desktop banner (D-303)", () => {
  it("адрес, имейл, парола и TOTP от банера на pnpm local; непълен банер → null", () => {
    expect(parseBanner(BANNER)).toEqual({
      url: "http://localhost:3000", email: "ti@mandat.local", password: "Ab3_x-9",
      totp: { secret: "ABCDEFGHIJKLMNOP", uri: "otpauth://totp/Mandat:ti%40mandat.local?secret=ABCDEFGHIJKLMNOP&issuer=Mandat&algorithm=SHA1&digits=6&period=30" },
    });
    expect(parseBanner(BANNER.replace(/ {2}Ключ:.*\n/, "").replace(/ {2}Адрес:.*\n/, ""))?.totp).toBeNull();
    expect(parseBanner("  Отвори:  http://localhost:3000\n")).toBeNull();
    expect(parseBanner(BANNER.replace("http://localhost:3000", "https://evil.example"))).toBeNull();
  });

  it("the English banner (E7е) gives the same fields", () => {
    const en = BANNER.replace("Отвори:", "Open:   ").replace("Имейл:", "Email:").replace("Парола:", "Password:").replace("Ключ:", "Key: ").replace("Адрес:", "URI: ");
    expect(parseBanner(en)).toEqual(parseBanner(BANNER));
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

  it("скриптът за вход попълва формата с JSON низове (без инжекция)", () => {
    const s = loginScript("a@b.c", 'p"w\');alert(1)//');
    expect(s).toContain(JSON.stringify('p"w\');alert(1)//'));
    expect(s).toContain('form[action="/api/auth/login"]');
  });
});
