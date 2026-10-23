// E9g A4 (AC-12.8, D-375): the lines the person types into the host terminal, for task_activities (never the ledger).
// It follows keystrokes, not the shell: printable text, backspace, Ctrl+U / Ctrl+C clear the line, escape sequences
// (arrows, history, bracketed paste markers, OSC) are dropped. Tab completion and history recall happen in the shell and
// are invisible here, so the trail is approximate by design.

export const MAX_LINE = 2000;

type State = "text" | "esc" | "csi" | "osc" | "osc_esc" | "ss3";

export class LineTracker {
  private line = "";
  private state: State = "text";

  /** Feed what the terminal emulator wrote; returns the lines completed by Enter, trimmed and non-empty. */
  feed(data: string): string[] {
    const out: string[] = [];
    for (const ch of data) {
      const c = ch.codePointAt(0) ?? 0;
      switch (this.state) {
        case "esc":
          this.state = ch === "[" ? "csi" : ch === "]" ? "osc" : ch === "O" ? "ss3" : "text";
          continue;
        case "csi":
          if (c >= 0x40 && c <= 0x7e) this.state = "text";
          continue;
        case "osc":
          if (c === 0x07) this.state = "text";
          else if (c === 0x1b) this.state = "osc_esc";
          continue;
        case "osc_esc":
          this.state = ch === "\\" ? "text" : "osc";
          continue;
        case "ss3":
          this.state = "text";
          continue;
        case "text":
          break;
      }
      if (c === 0x1b) this.state = "esc";
      else if (c === 0x0d || c === 0x0a) {
        const l = this.line.trim();
        if (l !== "") out.push(l);
        this.line = "";
      } else if (c === 0x7f || c === 0x08) this.line = Array.from(this.line).slice(0, -1).join("");
      else if (c === 0x03 || c === 0x15) this.line = "";
      else if (c >= 0x20 && Array.from(this.line).length < MAX_LINE) this.line += ch;
    }
    return out;
  }
}
