import { describe, expect, it } from "vitest";
import { HARNESS, JUDGE, pageName } from "./brand";

describe("brand (D-296)", () => {
  it("харнесът е Хамут, съдията е Мандат", () => {
    expect(HARNESS).toBe("Хамут");
    expect(JUDGE).toBe("Мандат");
    expect(pageName("Вход")).toBe("Вход · Хамут");
  });
});
