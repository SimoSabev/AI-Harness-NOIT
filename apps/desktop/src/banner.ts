// D-303: the pure part of the desktop wrapper — it reads what `pnpm local` prints and never logs it.
export interface Banner { url: string; email: string; password: string; totp: { secret: string; uri: string } | null }

/** E7f: the labels of the `pnpm local` banner in both languages (the CLI prints one of them). */
const LABEL = { url: ["Open", "Отвори"], email: ["Email", "Имейл"], password: ["Password", "Парола"], secret: ["Key", "Ключ"], uri: ["URI", "Адрес"] } as const;
const field = (text: string, labels: readonly string[]): string | null => new RegExp(`^ {2}(?:${labels.join("|")}):\\s+(\\S+)`, "m").exec(text)?.[1] ?? null;

/** The banner of `pnpm local` (packages/cli/src/commands/local.ts); null until it is complete. Only a localhost URL is accepted. */
export function parseBanner(text: string): Banner | null {
  const url = field(text, LABEL.url);
  const email = field(text, LABEL.email);
  const password = field(text, LABEL.password);
  if (!url || !email || !password || !/^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(url)) return null;
  const secret = field(text, LABEL.secret);
  const uri = field(text, LABEL.uri);
  return { url, email, password, totp: secret && uri?.startsWith("otpauth://") ? { secret, uri } : null };
}

/** A line of `pnpm local` stderr worth showing when it fails to start (either language of the CLI). */
export function isErrorLine(line: string): boolean {
  return /✗|грешка|не отговаря|не станаха|error|not responding|failed/i.test(line);
}

export function stepOf(line: string): { n: number; of: number; text: string } | null {
  const m = /^\[(\d)\/(\d)\] (.+)$/.exec(line.trim());
  return m ? { n: Number(m[1]), of: Number(m[2]), text: m[3] as string } : null;
}

/** API keys go to the proxy only through the UI (D-293); ELECTRON_RUN_AS_NODE must not leak into node children. */
export function childEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && k !== "ANTHROPIC_API_KEY" && k !== "OPENAI_API_KEY" && k !== "ELECTRON_RUN_AS_NODE") out[k] = v;
  return out;
}

export function allowedUrl(url: string, base: string): boolean {
  try {
    return new URL(url).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

/** Fills and submits the login form once; values are JSON string literals, so no input can break out of them. */
export function loginScript(email: string, password: string): string {
  return `(() => { const f = document.querySelector('form[action="/api/auth/login"]'); if (!f) return false; f.elements.namedItem("email").value = ${JSON.stringify(email)}; f.elements.namedItem("password").value = ${JSON.stringify(password)}; f.requestSubmit(); return true; })()`;
}
