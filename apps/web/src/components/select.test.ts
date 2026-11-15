import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Select, SelectListbox, listKey, openIndex, placeAbove, selectedIndex, typeAhead, type SelectOption } from "./select";

// The shared dropdown in our design (replaces the native <select>). No DOM in the unit tests: the markup is rendered
// on the server and the listbox element tree is walked to fire its handlers, like a click would.
const OPTS: SelectOption[] = [
  { value: "claude", label: "Claude" },
  { value: "codex", label: "Codex" },
  { value: "gemini", label: "Gemini" },
  { value: "demo", label: "Demo: deletes a test" },
];
const LABELS = OPTS.map((o) => o.label);

type Props = Record<string, unknown> & { children?: ReactNode };
function find(node: ReactNode, pred: (p: Props) => boolean): ReactElement<Props>[] {
  const out: ReactElement<Props>[] = [];
  const walk = (n: ReactNode): void => {
    Children.forEach(n, (c) => {
      if (!isValidElement<Props>(c)) return;
      if (pred(c.props)) out.push(c);
      walk(c.props.children);
    });
  };
  walk(node);
  return out;
}

function listbox(over: Partial<Parameters<typeof SelectListbox>[0]> = {}) {
  const onPick = vi.fn();
  const onHover = vi.fn();
  const el = SelectListbox({ id: "lb", labelledBy: "btn", options: OPTS, selected: 1, active: 2, mono: false, style: {}, onPick, onHover, onKeyDown: () => undefined, onBlur: () => undefined, ...over });
  return { el, onPick, onHover };
}

describe("Select: the trigger", () => {
  it("renders the current label, a listbox button, closed", () => {
    const html = renderToStaticMarkup(createElement(Select, { value: "gemini", onChange: () => undefined, options: OPTS, "aria-label": "Agent" }));
    expect(html).toContain(">Gemini<");
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(">Agent<"); // the visible-to-readers name, joined with the value through aria-labelledby
    expect(html).not.toContain('role="listbox"');
  });
  it("an unknown value shows the first option, like the native select", () => {
    const html = renderToStaticMarkup(createElement(Select, { value: "", onChange: () => undefined, options: OPTS }));
    expect(html).toContain(">Claude<");
  });
  it("with a name it keeps a hidden input, so a form submits the same value", () => {
    const html = renderToStaticMarkup(createElement(Select, { value: "codex", onChange: () => undefined, options: OPTS, name: "agent" }));
    expect(html).toMatch(/<input type="hidden" name="agent" value="codex"\/?>/);
    expect(renderToStaticMarkup(createElement(Select, { value: "codex", onChange: () => undefined, options: OPTS }))).not.toContain('type="hidden"');
  });
  it("disabled and mono reach the button", () => {
    const html = renderToStaticMarkup(createElement(Select, { value: "codex", onChange: () => undefined, options: OPTS, disabled: true, mono: true }));
    expect(html).toMatch(/<button[^>]*disabled/);
    expect(html).toContain("font-mono");
  });
});

describe("Select: the listbox", () => {
  it("roles: listbox with options, aria-selected on the value, aria-activedescendant on the active row", () => {
    const html = renderToStaticMarkup(listbox().el);
    expect(html).toContain('role="listbox"');
    expect(html.match(/role="option"/g)).toHaveLength(4);
    expect(html).toContain('aria-activedescendant="lb-opt-2"');
    expect(html).toMatch(/id="lb-opt-1" role="option" aria-selected="true"/);
    expect(html).toMatch(/id="lb-opt-0" role="option" aria-selected="false"/);
    expect(html).toContain('aria-labelledby="btn"');
  });
  it("a mouse click picks the option; hovering moves the active row", () => {
    const { el, onPick, onHover } = listbox();
    const [codex] = find(el, (p) => p.id === "lb-opt-3");
    const preventDefault = vi.fn();
    (codex!.props.onMouseDown as (e: { preventDefault: () => void }) => void)({ preventDefault }); // keeps the focus in the list
    expect(preventDefault).toHaveBeenCalled();
    (codex!.props.onMouseEnter as () => void)();
    expect(onHover).toHaveBeenCalledWith(3);
    (codex!.props.onClick as () => void)();
    expect(onPick).toHaveBeenCalledWith(3);
  });
  it("groups (the optgroup) have a header and role=group", () => {
    const grouped: SelectOption[] = [{ value: "a", label: "A", group: "Cloud" }, { value: "b", label: "B", group: "Cloud" }, { value: "c", label: "C", group: "Local" }];
    const html = renderToStaticMarkup(listbox({ options: grouped, selected: 0, active: 0 }).el);
    expect(html.match(/role="group"/g)).toHaveLength(2);
    expect(html).toContain(">Cloud<");
    expect(html).toContain(">Local<");
  });
});

describe("Select: the keyboard", () => {
  it("ArrowDown/ArrowUp move and stop at the ends; Home/End jump", () => {
    expect(listKey("ArrowDown", 0, LABELS)).toEqual({ type: "move", index: 1 });
    expect(listKey("ArrowDown", 3, LABELS)).toEqual({ type: "move", index: 3 });
    expect(listKey("ArrowUp", 2, LABELS)).toEqual({ type: "move", index: 1 });
    expect(listKey("ArrowUp", 0, LABELS)).toEqual({ type: "move", index: 0 });
    expect(listKey("Home", 2, LABELS)).toEqual({ type: "move", index: 0 });
    expect(listKey("End", 0, LABELS)).toEqual({ type: "move", index: 3 });
  });
  it("Enter and Space pick the active row", () => {
    expect(listKey("Enter", 2, LABELS)).toEqual({ type: "pick", index: 2 });
    expect(listKey(" ", 1, LABELS)).toEqual({ type: "pick", index: 1 });
    expect(listKey("Enter", -1, LABELS)).toEqual({ type: "close" });
  });
  it("Escape closes, Tab closes and lets the focus move on", () => {
    expect(listKey("Escape", 1, LABELS)).toEqual({ type: "close" });
    expect(listKey("Tab", 1, LABELS)).toEqual({ type: "tab" });
    expect(listKey("Shift", 1, LABELS)).toBeNull();
  });
  it("type-ahead: the next option by its first letter, wrapping around", () => {
    expect(listKey("g", 0, LABELS)).toEqual({ type: "move", index: 2 });
    expect(typeAhead("C", 0, LABELS)).toBe(1);
    expect(typeAhead("c", 1, LABELS)).toBe(0);
    expect(typeAhead("x", 1, LABELS)).toBeNull();
    expect(listKey("x", 1, LABELS)).toBeNull();
  });
  it("the closed trigger opens with the arrows (at the value), Home and End", () => {
    expect(openIndex("ArrowDown", 2, 4)).toBe(2);
    expect(openIndex("ArrowUp", 2, 4)).toBe(2);
    expect(openIndex("Home", 2, 4)).toBe(0);
    expect(openIndex("End", 2, 4)).toBe(3);
    expect(openIndex("a", 2, 4)).toBeNull();
  });
});

describe("Select: the helpers", () => {
  it("selectedIndex: the match, else the first, else none", () => {
    expect(selectedIndex(OPTS, "demo")).toBe(3);
    expect(selectedIndex(OPTS, "nope")).toBe(0);
    expect(selectedIndex([], "x")).toBe(-1);
  });
  it("placeAbove: only when the space below is short and above is larger", () => {
    expect(placeAbove({ top: 100, bottom: 130 }, 800, 200)).toBe(false);
    expect(placeAbove({ top: 700, bottom: 730 }, 800, 200)).toBe(true);
    expect(placeAbove({ top: 60, bottom: 90 }, 150, 200)).toBe(false); // short both ways: below wins
  });
});
