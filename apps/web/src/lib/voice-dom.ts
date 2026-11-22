import type { RawControl } from "./voice-controls";
import type { VoiceUi } from "./voice-tools";

// D-582: the browser side of Jarvis's hands — it describes the visible page as RawControl (the rules in voice-controls.ts
// decide what may be used) and acts like a person: types visibly, presses, chooses. React-controlled fields are set through
// the native value setter plus an input/change event, the same way the browser's own typing reaches React.

const SELECTOR = "button, a[href], input:not([type=hidden]), textarea, select";
const TOTP_DEPTH = 6;
let next = 0;

const visible = (e: HTMLElement): boolean => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
const text = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

function labelOf(e: HTMLElement): string {
  const aria = e.getAttribute("aria-label");
  if (aria) return text(aria);
  const by = e.getAttribute("aria-labelledby");
  if (by) return text(by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" "));
  if (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement || e instanceof HTMLSelectElement) {
    const l = e.labels?.[0]?.textContent;
    if (l) return text(l);
  }
  return text(e.textContent) || text(e.getAttribute("placeholder")) || text(e.getAttribute("title")) || text(e.getAttribute("name"));
}

/** a one-time-code field in the same form or a close ancestor: every approval in the UI asks for TOTP */
function nearTotp(e: HTMLElement): boolean {
  if (e.closest("form")?.querySelector('input[autocomplete="one-time-code"]')) return true;
  let p: HTMLElement | null = e.parentElement;
  for (let i = 0; p && i < TOTP_DEPTH; i++, p = p.parentElement) if (p.querySelector('input[autocomplete="one-time-code"]')) return true;
  return false;
}

function describe(e: HTMLElement): RawControl {
  if (!e.dataset.voiceId) e.dataset.voiceId = `v${++next}`;
  const tag = e.tagName.toLowerCase() as RawControl["tag"];
  const base: RawControl = { id: e.dataset.voiceId, tag, label: labelOf(e), disabled: (e as HTMLButtonElement).disabled === true, voice: e.closest("[data-voice]")?.getAttribute("data-voice") ?? null, inTotpForm: nearTotp(e) };
  if (e instanceof HTMLInputElement) return { ...base, inputType: e.type, autocomplete: e.autocomplete, name: e.name, value: e.type === "password" ? "" : e.type === "checkbox" || e.type === "radio" ? String(e.checked) : e.value };
  if (e instanceof HTMLTextAreaElement) return { ...base, name: e.name, value: e.value };
  if (e instanceof HTMLSelectElement) return { ...base, name: e.name, value: e.selectedOptions[0] ? text(e.selectedOptions[0].textContent) : "", options: [...e.options].map((o) => text(o.textContent) || o.value) };
  return base;
}

const byId = (id: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-voice-id="${CSS.escape(id)}"]`);

function setNative(e: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(e, value);
  e.dispatchEvent(new Event("input", { bubbles: true }));
}

export function domUi(): VoiceUi {
  return {
    scan: () => [...document.querySelectorAll<HTMLElement>(SELECTOR)].filter(visible).map(describe),
    async type(id, value, mode) {
      const e = byId(id);
      if (!(e instanceof HTMLTextAreaElement || (e instanceof HTMLInputElement && !["checkbox", "radio", "submit", "button", "file"].includes(e.type)))) return false;
      e.focus();
      const start = mode === "append" ? e.value : "";
      // visibly: about 30 steps, whatever the length
      const step = Math.max(1, Math.ceil(value.length / 30));
      for (let i = step; i < value.length; i += step) {
        setNative(e, start + value.slice(0, i));
        await new Promise((r) => setTimeout(r, 15));
      }
      setNative(e, start + value);
      return true;
    },
    press(id) {
      const e = byId(id);
      if (!e) return false;
      e.scrollIntoView({ block: "center" });
      e.click();
      return true;
    },
    choose(id, option) {
      const e = byId(id);
      if (!(e instanceof HTMLSelectElement)) return false;
      const o = [...e.options].find((x) => (text(x.textContent) || x.value) === option || x.value === option);
      if (!o) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(e, o.value);
      e.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
  };
}
