import { VOICE_PERSON_ONLY as PERSON_ONLY, VOICE_SECRET_NAME as SECRET_NAME } from "@mandat/contract";

// D-582 (Simo 22.11.2026): Jarvis controls the screens like a person — every field, button, link and choice — except what
// stays with the person: approving, merging, signing, keys, deleting, logging out. Pure: the browser adapter (voice-dom.ts)
// describes the page as RawControl, these rules decide; a blocked control is never shown to the model and refused if named.

export interface RawControl {
  /** data-voice-id the adapter gave it (v1, v2, …) */
  id: string;
  tag: "button" | "a" | "input" | "textarea" | "select";
  label: string;
  disabled: boolean;
  /** data-voice on the element or an ancestor: "never" hides it, "prompt" marks the main prompt field */
  voice: string | null;
  /** inside a form that asks for a one-time code: every approval in the UI does (TOTP) */
  inTotpForm: boolean;
  inputType?: string;
  autocomplete?: string;
  name?: string;
  value?: string;
  options?: string[];
  /** D-586: it has the keyboard focus */
  focused?: boolean;
  /** D-586: inside a closed <details>; the browser opens it before acting */
  collapsed?: boolean;
}

export interface ControlView { id: string; kind: "button" | "link" | "field" | "choice" | "checkbox"; label: string; value?: string; options?: string[]; collapsed?: true }

const VALUE_MAX = 200;

/** null when Jarvis may use it, else why not (for the refusal) */
export function controlBlocked(c: RawControl): string | null {
  if (c.voice === "never") return "marked_never";
  if (c.disabled) return "disabled";
  if (c.inTotpForm || c.autocomplete === "one-time-code") return "second_factor";
  if (c.tag === "input" && (c.inputType === "password" || (c.name !== undefined && SECRET_NAME.test(c.name)))) return "secret_field";
  if (PERSON_ONLY.test(c.label)) return "person_only";
  return null;
}

const kindOf = (c: RawControl): ControlView["kind"] =>
  c.tag === "a" ? "link" : c.tag === "select" ? "choice" : c.tag === "button" ? "button" : c.inputType === "checkbox" || c.inputType === "radio" ? "checkbox" : c.inputType === "submit" || c.inputType === "button" ? "button" : "field";

const short = (v: string): string => (v.length > VALUE_MAX ? `${v.slice(0, VALUE_MAX - 1)}…` : v);

/** what the model reads about a control; null for one it may not use */
export function controlView(c: RawControl): ControlView | null {
  if (controlBlocked(c) !== null) return null;
  const kind = kindOf(c);
  return {
    id: c.id,
    kind,
    label: short(c.label),
    ...((kind === "field" || kind === "choice" || kind === "checkbox") && c.value !== undefined ? { value: short(c.value) } : {}),
    ...(kind === "choice" && c.options ? { options: c.options.slice(0, 50).map(short) } : {}),
    ...(c.collapsed ? { collapsed: true as const } : {}),
  };
}

const TEXT_INPUTS = new Set(["text", "search", "url", "email", "number", "tel", ""]);
const takesText = (c: RawControl): boolean => c.tag === "textarea" || (c.tag === "input" && TEXT_INPUTS.has(c.inputType ?? ""));

/**
 * The prompt field of the screen, on every screen (D-586): the one marked data-voice=prompt, else the focused text field,
 * else the first text area, else the first text input; none only when the screen has no usable text field at all.
 */
export function promptField(controls: readonly RawControl[]): string | null {
  const usable = controls.filter((c) => takesText(c) && controlBlocked(c) === null);
  const pick = usable.find((c) => c.voice === "prompt") ?? usable.find((c) => c.focused === true) ?? usable.find((c) => c.tag === "textarea") ?? usable[0];
  return pick?.id ?? null;
}
