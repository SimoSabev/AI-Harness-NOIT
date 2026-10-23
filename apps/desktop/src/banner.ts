// D-303: the pure part of the desktop wrapper — it reads what `pnpm local` prints. D-368: `pnpm local` has no login, so
// the banner is only the address; the window opens it and is in.
export interface Banner { url: string }

/** E7f: the labels of the `pnpm local` banner in both languages (the CLI prints one of them). */
const LABEL = { url: ["Open", "Отвори"] } as const;
const field = (text: string, labels: readonly string[]): string | null => new RegExp(`^ {2}(?:${labels.join("|")}):\\s+(\\S+)`, "m").exec(text)?.[1] ?? null;

/** The banner of `pnpm local` (packages/cli/src/commands/local.ts); null until it is there. Only a localhost URL is accepted. */
export function parseBanner(text: string): Banner | null {
  const url = field(text, LABEL.url);
  return url && /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(url) ? { url } : null;
}

/** A line of `pnpm local` stderr worth showing when it fails to start (either language of the CLI). */
export function isErrorLine(line: string): boolean {
  return /✗|грешка|не отговаря|не станаха|error|not responding|failed/i.test(line);
}

export function stepOf(line: string): { n: number; of: number; text: string } | null {
  const m = /^\[(\d)\/(\d)\] (.+)$/.exec(line.trim());
  return m ? { n: Number(m[1]), of: Number(m[2]), text: m[3] as string } : null;
}

/** API keys go to the proxy only through the UI (D-293); ELECTRON_RUN_AS_NODE and the KEK (D-374) must not leak into node children. */
export function childEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && k !== "ANTHROPIC_API_KEY" && k !== "OPENAI_API_KEY" && k !== "ELECTRON_RUN_AS_NODE" && k !== "MANDAT_KEK") out[k] = v;
  return out;
}

export function allowedUrl(url: string, base: string): boolean {
  try {
    return new URL(url).origin === new URL(base).origin;
  } catch {
    return false;
  }
}
