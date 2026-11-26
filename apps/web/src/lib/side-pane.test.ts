import { describe, expect, it } from "vitest";
import { SIDE_DEFAULT, SIDE_MAX, SIDE_MIN, clampSide, composerHeight, parseSide, sideCookie } from "./side-pane";

// D-620: the list of conversations folds away and is wider or narrower by dragging its edge; the choice is a cookie, so
// the server draws it right from the first byte. D-621: the box grows with its text up to a limit, then scrolls.
describe("the side pane (D-620)", () => {
  it("reads a width or folded from the cookie; anything else is the default", () => {
    expect(parseSide(undefined)).toEqual({ folded: false, width: SIDE_DEFAULT });
    expect(parseSide("folded")).toEqual({ folded: true, width: SIDE_DEFAULT });
    expect(parseSide("folded:300")).toEqual({ folded: true, width: 300 });
    expect(parseSide("312")).toEqual({ folded: false, width: 312 });
    expect(parseSide("9999")).toEqual({ folded: false, width: SIDE_MAX });
    expect(parseSide("12")).toEqual({ folded: false, width: SIDE_MIN });
    expect(parseSide("abc")).toEqual({ folded: false, width: SIDE_DEFAULT });
  });
  it("writes what it reads", () => {
    for (const s of [{ folded: false, width: 280 }, { folded: true, width: 330 }]) expect(parseSide(sideCookie(s))).toEqual(s);
    expect(clampSide(250.6)).toBe(251);
  });
});

describe("the box's height (D-621)", () => {
  it("one line when empty, the text's own height while it fits, then the cap (and it scrolls)", () => {
    expect(composerHeight(0, 400)).toBe(24);
    expect(composerHeight(120, 400)).toBe(120);
    expect(composerHeight(900, 400)).toBe(400);
  });
});
