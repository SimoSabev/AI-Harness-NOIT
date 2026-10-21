import { describe, expect, it } from "vitest";
import { HARNESS, JUDGE, pageName } from "./brand";

describe("brand (D-296)", () => {
  it("харнесът още няма име (празно навсякъде); съдията е Мандат", () => {
    expect(HARNESS).toBe("");
    expect(JUDGE).toBe("Мандат");
    expect(pageName("Вход")).toBe("Вход");
  });
});
