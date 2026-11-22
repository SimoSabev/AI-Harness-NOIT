import { describe, expect, it } from "vitest";
import { controlBlocked, controlView, promptField } from "./voice-controls";
import type { RawControl } from "./voice-controls";

// D-582 (Simo 22.11.2026): Jarvis controls the screens like a person — every field, button and choice — except what stays
// with the person: approvals, merging, signing, keys, deleting. Those controls are never listed to the model and refused if named.
const c = (over: Partial<RawControl>): RawControl => ({ id: "v1", tag: "button", label: "Start the work", disabled: false, voice: null, inTotpForm: false, ...over });

describe("which controls Jarvis may use (D-582)", () => {
  it("an ordinary button, link, field or choice: allowed", () => {
    expect(controlBlocked(c({}))).toBeNull();
    expect(controlBlocked(c({ tag: "a", label: "Settings" }))).toBeNull();
    expect(controlBlocked(c({ tag: "textarea", label: "Describe the task" }))).toBeNull();
    expect(controlBlocked(c({ tag: "select", label: "Model", options: ["claude-sonnet-5-5"] }))).toBeNull();
  });

  it("approve, merge, sign, delete, keys, tokens, log out — in English or Bulgarian: blocked", () => {
    for (const label of ["Approve and merge", "Одобри", "Одобри и слей", "Merge", "Sign the commit", "Подпиши", "Delete project", "Изтрий", "Remove the key", "Премахни ключа", "Save the key", "API key", "Revoke", "Отнеми", "Log out", "Излез", "Token", "TOTP"]) {
      expect(controlBlocked(c({ label })), label).not.toBeNull();
    }
  });

  it("anything in a form with a one-time code (every approval in the UI asks for TOTP): blocked, whatever its label", () => {
    expect(controlBlocked(c({ label: "Confirm", inTotpForm: true }))).toBe("second_factor");
  });

  it("password, one-time-code and secret-named fields; data-voice=never; disabled: blocked", () => {
    expect(controlBlocked(c({ tag: "input", inputType: "password", label: "ElevenLabs" }))).toBe("secret_field");
    expect(controlBlocked(c({ tag: "input", autocomplete: "one-time-code", label: "Code" }))).toBe("second_factor");
    expect(controlBlocked(c({ tag: "input", name: "anthropic_key", label: "Anthropic" }))).toBe("secret_field");
    expect(controlBlocked(c({ voice: "never", label: "Jarvis" }))).toBe("marked_never");
    expect(controlBlocked(c({ disabled: true }))).toBe("disabled");
  });

  it("what the model sees: id, kind, label, a field's value (short), a choice's options; never a blocked control", () => {
    expect(controlView(c({ id: "v2", tag: "textarea", label: "Describe the task", value: "x".repeat(500) }))).toEqual({ id: "v2", kind: "field", label: "Describe the task", value: `${"x".repeat(199)}…` });
    expect(controlView(c({ id: "v3", tag: "select", label: "Model", value: "a", options: ["a", "b"] }))).toEqual({ id: "v3", kind: "choice", label: "Model", value: "a", options: ["a", "b"] });
    expect(controlView(c({ id: "v4", tag: "a", label: "Settings" }))).toEqual({ id: "v4", kind: "link", label: "Settings" });
    expect(controlView(c({ label: "Approve" }))).toBeNull();
  });

  it("the prompt field, on every screen (D-586): marked, else focused, else the first text area, else the first text input", () => {
    const area = (id: string, over: Partial<RawControl> = {}) => c({ id, tag: "textarea", label: "x", ...over });
    const text = (id: string, over: Partial<RawControl> = {}) => c({ id, tag: "input", inputType: "text", label: "x", ...over });
    expect(promptField([area("v1"), area("v2", { voice: "prompt" })])).toBe("v2");
    expect(promptField([area("v1"), text("v2", { focused: true })])).toBe("v2");
    expect(promptField([c({ id: "v1" }), area("v2"), area("v3")])).toBe("v2");
    expect(promptField([c({ id: "v1" }), text("v2", { inputType: "checkbox" }), text("v3", { inputType: "search" })])).toBe("v3");
    expect(promptField([text("v1", { inputType: "password" }), area("v2", { inTotpForm: true })])).toBeNull();
    expect(promptField([c({ id: "v1" })])).toBeNull();
  });

  it("a field inside a collapsed section is still usable; the browser opens the section (D-586)", () => {
    expect(controlView(c({ id: "v5", tag: "textarea", label: "Instructions", collapsed: true }))).toEqual({ id: "v5", kind: "field", label: "Instructions", collapsed: true });
  });
});
