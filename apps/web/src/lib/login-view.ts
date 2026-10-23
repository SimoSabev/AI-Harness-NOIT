import type { LoginState } from "@mandat/contract";
import type { Key } from "../i18n/t";

// D-369: the subscription login on the Accounts page — which part to show, whether to ask the server again, what to say.
export interface LoginView { show: "form" | "wait" | "code"; poll: boolean; note: Key | null }

export function loginView(s: LoginState): LoginView {
  switch (s.state) {
    case "idle":
      return { show: "form", poll: false, note: null };
    case "starting":
      return { show: "wait", poll: true, note: "keys.login.starting" };
    case "waiting_code":
      return { show: "code", poll: true, note: null };
    case "checking":
      return { show: "wait", poll: true, note: "keys.login.checking" };
    case "done":
      return { show: "form", poll: false, note: "keys.login.done" };
    case "failed":
      return { show: "form", poll: false, note: `keys.login.fail.${s.reason}` };
  }
}
