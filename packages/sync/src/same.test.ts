import { describe, expect, it } from "vitest";
import { sameJson } from "./same.js";

describe("sameJson", () => {
  it("ignores key order at every depth, not array order", () => {
    expect(sameJson({ b: 1, a: { d: [1, { y: 1, x: 2 }], c: null } }, { a: { c: null, d: [1, { x: 2, y: 1 }] }, b: 1 })).toBe(true);
    expect(sameJson([1, 2], [2, 1])).toBe(false);
    expect(sameJson({ a: undefined }, {})).toBe(true);
    expect(sameJson(undefined, undefined)).toBe(true);
  });
});
