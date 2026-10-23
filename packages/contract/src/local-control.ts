import { z } from "zod";

// D-369: what crosses between `mandat local` (its control endpoint, 127.0.0.1 + bearer token) and the web server.
// The subscription login runs the unchanged `claude auth login` in a container; the web shows Anthropic's address and
// hands the code the person pastes to that process's stdin — never stored, never logged, never echoed back.

/** A profile volume name (packages/sandbox profileVolume). */
export const AccountName = z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/);

/** The code from Anthropic's page: one printable line without spaces (PKCE — useless without the process that asked). */
export const LoginCode = z.string().trim().regex(/^[\x21-\x7e]{8,512}$/);

const LOGIN_HOSTS = ["claude.com", "claude.ai", "platform.claude.com", "console.anthropic.com"];
const URL_RE = /https:\/\/[^\s"'<>]+/g;
// the BEL / ESC of an OSC 8 terminal link end an address too
const CONTROL = [String.fromCharCode(7), String.fromCharCode(27)];

export function isLoginUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === "https:" && p.username === "" && p.password === "" && p.port === "" && LOGIN_HOSTS.includes(p.hostname) && /\/oauth\/authorize$/.test(p.pathname);
  } catch {
    return false;
  }
}

/** The authorize address in the output of `claude auth login` [Claude Code 2.1.302: „If the browser didn't open, visit: …“]. */
export function findLoginUrl(text: string): string | null {
  const plain = CONTROL.reduce((t, c) => t.split(c).join(" "), text);
  for (const m of plain.matchAll(URL_RE)) if (isLoginUrl(m[0])) return m[0];
  return null;
}

export const LoginFailure = z.enum(["busy", "images_missing", "start_failed", "no_url", "invalid_code", "not_logged_in", "timeout", "cancelled"]);
export type LoginFailure = z.infer<typeof LoginFailure>;

export const LoginState = z.discriminatedUnion("state", [
  z.object({ state: z.literal("idle") }).strict(),
  z.object({ state: z.literal("starting"), name: AccountName }).strict(),
  z.object({ state: z.literal("waiting_code"), name: AccountName, url: z.string().max(4096).refine(isLoginUrl) }).strict(),
  z.object({ state: z.literal("checking"), name: AccountName }).strict(),
  z.object({ state: z.literal("done"), name: AccountName, email: z.string().max(320).nullable(), plan: z.string().max(100).nullable() }).strict(),
  z.object({ state: z.literal("failed"), name: AccountName, reason: LoginFailure }).strict(),
]);
export type LoginState = z.infer<typeof LoginState>;
