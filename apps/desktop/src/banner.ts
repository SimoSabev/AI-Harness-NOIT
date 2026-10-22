// D-303: the pure part of the desktop wrapper — it reads what `pnpm local` prints and never logs it.
export interface Banner { url: string; email: string; password: string; totp: { secret: string; uri: string } | null }

const field = (text: string, label: string): string | null => new RegExp(`^ {2}${label}:\\s+(\\S+)`, "m").exec(text)?.[1] ?? null;

/** The banner of `pnpm local` (packages/cli/src/commands/local.ts); null until it is complete. Only a localhost URL is accepted. */
export function parseBanner(text: string): Banner | null {
  const url = field(text, "Отвори");
  const email = field(text, "Имейл");
  const password = field(text, "Парола");
  if (!url || !email || !password || !/^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(url)) return null;
  const secret = field(text, "Ключ");
  const uri = field(text, "Адрес");
  return { url, email, password, totp: secret && uri?.startsWith("otpauth://") ? { secret, uri } : null };
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

/** D-309: `pnpm desktop` starts us through pnpm, so npm_execpath is that pnpm (pnpm.exe on Windows, where a bare
 * `pnpm` is pnpm.cmd and spawn cannot run it without a shell); a JS entry runs under node. */
export function localSpawn(env: Record<string, string | undefined>): { cmd: string; args: string[] } {
  const pnpm = env.npm_execpath;
  if (!pnpm) return { cmd: "pnpm", args: ["local"] };
  if (/\.[cm]?js$/.test(pnpm)) return { cmd: env.npm_node_execpath ?? "node", args: [pnpm, "local"] };
  return { cmd: pnpm, args: ["local"] };
}

/** D-309: on Windows a signal only ends pnpm itself; the web server would keep the port, so the whole tree goes. */
export function stopCommand(pid: number | undefined, platform: NodeJS.Platform): { cmd: string; args: string[] } | null {
  return platform === "win32" && pid !== undefined ? { cmd: "taskkill", args: ["/pid", String(pid), "/T", "/F"] } : null;
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
