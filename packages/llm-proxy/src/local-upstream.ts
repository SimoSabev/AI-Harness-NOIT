import { ConnectionId, ModelId, upstreamUrl } from "@mandat/contract";

// E9в (spec 5.3, D-422): a local model server (Ollama, LM Studio, vLLM) named in the proxy's environment:
//   MANDAT_UPSTREAM_LOCAL_<LABEL>=<address>             → upstream id local-<label> (lower case, _ → -)
//   MANDAT_UPSTREAM_LOCAL_<LABEL>_MODELS=<id>,<id>      → the allowed models (required: the proxy keeps an allowlist)
//   MANDAT_UPSTREAM_LOCAL_<LABEL>_WIRE=anthropic|openai → the API it speaks (default anthropic; Codex needs openai/Responses)
// Same address rules as a saved connection (contract upstreamUrl): this computer over http/https, or https to a name.
// A local upstream has no key, costs $0 and is watched for replies without a tool (NO_TOOLS_LIMIT).

export interface LocalUpstream { wire: "anthropic" | "openai"; url: string; models: string[] }
const PREFIX = "MANDAT_UPSTREAM_LOCAL_";
const LABEL = /^[A-Z0-9][A-Z0-9_]{0,23}$/;

/** The local upstreams of an environment; errors name the variable, never its value. */
export function localUpstreamsFromEnv(env: Readonly<Record<string, string | undefined>>): { upstreams: Record<string, LocalUpstream>; errors: string[] } {
  const upstreams: Record<string, LocalUpstream> = {};
  const errors: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith(PREFIX) || /_(MODELS|WIRE)$/.test(name) || value === undefined) continue;
    const label = name.slice(PREFIX.length);
    const id = `local-${label.toLowerCase().replace(/_/g, "-")}`;
    if (!LABEL.test(label) || !ConnectionId.safeParse(id).success) {
      errors.push(`${name}: bad label`);
      continue;
    }
    const models = (env[`${name}_MODELS`] ?? "").split(",").map((m) => m.trim()).filter((m) => m !== "");
    if (models.length === 0 || models.length > 20 || !models.every((m) => ModelId.safeParse(m).success)) {
      errors.push(`${name}: models missing`);
      continue;
    }
    const u = upstreamUrl(value);
    if (!u.ok) {
      errors.push(`${name}: bad address`);
      continue;
    }
    const wire = env[`${name}_WIRE`] ?? "anthropic";
    if (wire !== "anthropic" && wire !== "openai") {
      errors.push(`${name}: bad wire`);
      continue;
    }
    upstreams[id] = { wire, url: u.url, models };
  }
  return { upstreams, errors };
}
