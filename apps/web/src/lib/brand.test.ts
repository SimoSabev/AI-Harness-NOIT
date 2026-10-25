import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APP_COLOR, APP_ICONS, FAVICON, HARNESS, JUDGE, pageName } from "./brand";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("brand (D-296)", () => {
  it("харнесът още няма име (празно навсякъде); съдията е Мандат", () => {
    expect(HARNESS).toBe("");
    expect(JUDGE).toBe("Mandat");
    expect(pageName("Вход")).toBe("Вход");
  });

  it("the installed app (PWA) has the dark canvas and the logo icons; the tab has the logo (D-382, D-383)", () => {
    const tokens = readFileSync(path.join(web, "src/app/tokens.css"), "utf8");
    expect(APP_COLOR).toBe(/\[data-theme="dark"\]\s*\{[^}]*--canvas:\s*(#[0-9a-f]{6})/.exec(tokens)?.[1]);
    expect(APP_ICONS.map((i) => i.purpose ?? "any")).toEqual(["any", "any", "maskable"]);
    for (const i of APP_ICONS) {
      const png = readFileSync(path.join(web, "public", i.src));
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, i.src).toBe(i.sizes);
    }
    expect(FAVICON).toEqual({ url: "/logo.png", type: "image/png" });
    readFileSync(path.join(web, "public/logo.png"));
  });
});
