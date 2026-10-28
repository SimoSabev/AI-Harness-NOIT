import { MandatError } from "@mandat/contract";

// D-441: which engines the server searches. On this computer: SearXNG on loopback (D-407) and the open APIs. In the
// sandbox sidecar the worker passes `--searxng http://mandat-searxng:8080` (the container on mandat-upstream);
// `--providers` narrows the list (own search only, or a test fixture).
export const DEFAULT_SEARXNG = "http://127.0.0.1:8888";
export const PROVIDER_NAMES = ["searxng", "wikipedia", "arxiv", "github", "stackexchange"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export function providersFromArgs(argv: readonly string[], env: Record<string, string | undefined>): { searxngUrl: string; only?: ProviderName[] } {
  const val = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const searxngUrl = val("--searxng") ?? env.MANDAT_SEARXNG_URL ?? DEFAULT_SEARXNG;
  if (!/^https?:\/\/[^\s/]+(\/\S*)?$/.test(searxngUrl)) throw new MandatError("E_USAGE", "--searxng needs an http(s) URL");
  const list = val("--providers");
  if (list === undefined) return { searxngUrl };
  const only = list.split(",").filter((x) => x !== "");
  for (const p of only) if (!(PROVIDER_NAMES as readonly string[]).includes(p)) throw new MandatError("E_USAGE", `unknown provider ${p.slice(0, 40)}`);
  return { searxngUrl, only: only as ProviderName[] };
}
