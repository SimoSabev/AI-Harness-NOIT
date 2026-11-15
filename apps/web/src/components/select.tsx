"use client";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";

// The dropdown in our design, in place of the native <select> (the owner: "use our design").
// A button opens a listbox in a portal (so no <label> or overflow around it changes it); the focus moves into the list,
// which keeps the active row in aria-activedescendant. Values and onChange are those of the native select:
// onChange fires only when the value changes; an unknown value shows the first option.
export interface SelectOption { value: string; label: string; group?: string }

export type ListKeyAction = { type: "move"; index: number } | { type: "pick"; index: number } | { type: "close" } | { type: "tab" } | null;

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  "aria-label"?: string;
  /** Without aria-label the name comes from the <label> around the select, as before. */
  mono?: boolean;
  disabled?: boolean;
  /** Classes for the wrapper (margin, width). */
  className?: string;
  /** md: the form field (like `input`); sm: the compact chip of the task box. */
  size?: "md" | "sm";
  /** A form field name: a hidden input carries the value, so a form submits it as the native select did. */
  name?: string;
}

const MAX_LIST_PX = 288; // max-h-72
const ROW_PX = 34;
const GAP_PX = 4;
const NAV_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

export function selectedIndex(options: readonly SelectOption[], value: string): number {
  const i = options.findIndex((o) => o.value === value);
  return i >= 0 ? i : options.length > 0 ? 0 : -1;
}

/** The next option (after the active one, wrapping) whose label starts with the letter. */
export function typeAhead(char: string, active: number, labels: readonly string[]): number | null {
  const c = char.toLocaleLowerCase();
  const n = labels.length;
  for (let step = 1; step <= n; step++) {
    const i = (((active + step) % n) + n) % n;
    if (labels[i]?.toLocaleLowerCase().startsWith(c)) return i;
  }
  return null;
}

/** What a key does in the open list. */
export function listKey(key: string, active: number, labels: readonly string[]): ListKeyAction {
  const last = labels.length - 1;
  switch (key) {
    case "ArrowDown": return { type: "move", index: Math.min(active + 1, last) };
    case "ArrowUp": return { type: "move", index: Math.max(active - 1, 0) };
    case "Home": return { type: "move", index: 0 };
    case "End": return { type: "move", index: last };
    case "Enter":
    case " ": return active >= 0 ? { type: "pick", index: active } : { type: "close" };
    case "Escape": return { type: "close" };
    case "Tab": return { type: "tab" };
  }
  if (key.length !== 1) return null;
  const i = typeAhead(key, active, labels);
  return i === null ? null : { type: "move", index: i };
}

/** The active row when a key opens the closed list; null: the key does not open it. */
export function openIndex(key: string, selected: number, count: number): number | null {
  if (!NAV_KEYS.has(key)) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return selected;
}

/** Open above only when the room below is short and there is more above. */
export function placeAbove(rect: { top: number; bottom: number }, viewportHeight: number, listHeight: number): boolean {
  const below = viewportHeight - rect.bottom - GAP_PX;
  const above = rect.top - GAP_PX;
  return below < Math.min(listHeight, MAX_LIST_PX) && above > below;
}

function popoverStyle(r: DOMRect, rows: number): CSSProperties {
  const vh = window.innerHeight;
  const up = placeAbove(r, vh, rows * ROW_PX + 8);
  const base: CSSProperties = { left: r.left, minWidth: r.width, maxWidth: Math.max(r.width, window.innerWidth - r.left - 8) };
  return up ? { ...base, bottom: vh - r.top + GAP_PX } : { ...base, top: r.bottom + GAP_PX };
}

const TRIGGER = {
  md: "flex w-full items-center gap-2 rounded-lg border border-line-strong bg-canvas px-3 py-2 text-left text-sm text-ink",
  sm: "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-canvas px-2 py-1 text-left text-sm text-ink",
} as const;
const TRIGGER_STATE = "transition hover:border-accent-text/60 hover:bg-raised aria-expanded:border-accent-text disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-canvas";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={`size-3.5 shrink-0 text-mute transition-transform ${open ? "rotate-180" : ""}`}>
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0 text-accent-text">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface SelectListboxProps {
  id: string;
  labelledBy: string;
  options: readonly SelectOption[];
  selected: number;
  active: number;
  mono: boolean;
  style: CSSProperties;
  listRef?: Ref<HTMLDivElement>;
  onPick: (index: number) => void;
  onHover: (index: number) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  onBlur: (e: FocusEvent<HTMLDivElement>) => void;
}

export const optionId = (listId: string, i: number): string => `${listId}-opt-${i}`;

/** The open list: presentational, the state lives in Select. */
export function SelectListbox({ id, labelledBy, options, selected, active, mono, style, listRef, onPick, onHover, onKeyDown, onBlur }: SelectListboxProps) {
  const row = (o: SelectOption, i: number) => (
    <div key={`${i}-${o.value}`} id={optionId(id, i)} role="option" aria-selected={i === selected}
      onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => onHover(i)} onClick={() => onPick(i)}
      className={`flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${i === active ? "bg-raised text-ink" : "text-ink/90"} ${i === selected ? "font-medium text-ink" : ""} ${mono ? "font-mono" : ""}`}>
      <span className="min-w-0 flex-1 truncate">{o.label}</span>
      {i === selected ? <Check /> : <span aria-hidden="true" className="size-3.5 shrink-0" />}
    </div>
  );
  const grouped = options.some((o) => o.group !== undefined);
  let body: ReactNode;
  if (!grouped) body = options.map(row);
  else {
    const groups: { name: string; items: { o: SelectOption; i: number }[] }[] = [];
    options.forEach((o, i) => {
      const name = o.group ?? "";
      const last = groups[groups.length - 1];
      if (last && last.name === name) last.items.push({ o, i });
      else groups.push({ name, items: [{ o, i }] });
    });
    body = groups.map((g, gi) => (
      <div key={`${gi}-${g.name}`} role="group" aria-labelledby={`${id}-g-${gi}`} className={gi > 0 ? "mt-1 border-t border-line pt-1" : ""}>
        <div id={`${id}-g-${gi}`} role="presentation" className="px-2.5 pb-1 pt-1.5 font-display text-[11px] font-medium uppercase tracking-[0.12em] text-mute">{g.name}</div>
        {g.items.map(({ o, i }) => row(o, i))}
      </div>
    ));
  }
  return (
    <div ref={listRef} id={id} role="listbox" tabIndex={-1} aria-labelledby={labelledBy} aria-activedescendant={active >= 0 ? optionId(id, active) : undefined}
      onKeyDown={onKeyDown} onBlur={onBlur} onMouseDown={(e) => e.preventDefault()} style={style}
      className="rise fixed z-50 max-h-72 overflow-y-auto rounded-xl border border-line-strong bg-panel p-1 shadow-xl shadow-black/30 outline-none">
      {body}
    </div>
  );
}

export function Select({ value, onChange, options, "aria-label": ariaLabel, mono = false, disabled = false, className = "", size = "md", name }: SelectProps) {
  const uid = useId();
  const buttonId = `${uid}-btn`;
  const listId = `${uid}-list`;
  const labelId = `${uid}-label`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [style, setStyle] = useState<CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sel = selectedIndex(options, value);
  const current = options[sel];

  const place = useCallback(() => {
    const b = btnRef.current;
    if (b) setStyle(popoverStyle(b.getBoundingClientRect(), options.length));
  }, [options.length]);

  const show = (index: number) => {
    if (disabled || options.length === 0) return;
    place();
    setActive(index);
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  };
  const pick = (i: number) => {
    const o = options[i];
    close(true);
    if (o && o.value !== value) onChange(o.value);
  };

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus({ preventScroll: true });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (open && active >= 0) document.getElementById(optionId(listId, active))?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (open) return;
    const i = openIndex(e.key, sel, options.length);
    if (i === null) return;
    e.preventDefault();
    show(i);
  };
  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const a = listKey(e.key, active, options.map((o) => o.label));
    if (!a) return;
    if (a.type === "tab") return close(true); // the button takes the focus; Tab then moves on from it
    e.preventDefault();
    e.stopPropagation();
    if (a.type === "move") setActive(a.index);
    else if (a.type === "pick") pick(a.index);
    else close(true);
  };
  const onListBlur = (e: FocusEvent<HTMLDivElement>) => {
    const to = e.relatedTarget;
    if (to instanceof Node && (btnRef.current?.contains(to) || listRef.current?.contains(to))) return;
    close(false);
  };

  return (
    <div className={`relative ${size === "md" ? "block" : "inline-block max-w-full"} ${className}`}>
      {ariaLabel !== undefined && <span id={labelId} className="sr-only">{ariaLabel}</span>}
      <button ref={btnRef} type="button" id={buttonId} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-labelledby={ariaLabel !== undefined ? `${labelId} ${buttonId}` : undefined}
        onClick={() => (open ? close(true) : show(sel))} onKeyDown={onTriggerKey} className={`${TRIGGER[size]} ${TRIGGER_STATE}`}>
        <span className={`min-w-0 flex-1 truncate ${mono ? "font-mono" : ""}`}>{current?.label ?? ""}</span>
        <Chevron open={open} />
      </button>
      {name !== undefined && <input type="hidden" name={name} value={current?.value ?? ""} />}
      {open && createPortal(
        <SelectListbox id={listId} labelledBy={ariaLabel !== undefined ? labelId : buttonId} options={options} selected={sel} active={active} mono={mono} style={style}
          listRef={listRef} onPick={pick} onHover={setActive} onKeyDown={onListKey} onBlur={onListBlur} />,
        document.body,
      )}
    </div>
  );
}
