// USD per million tokens. Source: platform.claude.com/docs/en/about-claude/pricing (20.10.2026), prompt 4.5 / 6.11.
interface Rate {
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
}
const SONNET: Rate = { input: 2, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.1, output: 10 };
const HAIKU_SMALL: Rate = { input: 0.1, cacheWrite5m: 0.125, cacheWrite1h: 0.2, cacheRead: 0.01, output: 0.5 };
const HAIKU_LARGE: Rate = { input: 0.5, cacheWrite5m: 0.625, cacheWrite1h: 1, cacheRead: 0.05, output: 2.5 };

export const ALLOWED_MODELS: readonly string[] = ["claude-sonnet-5-5", "claude-haiku-5-5"];

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
}

/** null = unknown model. D-068: the 5m/1h breakdown wins; only the total → billed as 5m. */
export function costUsd(model: string, u: Usage): number | null {
  const cc = u.cache_creation;
  const hasBreakdown = cc !== undefined && (cc.ephemeral_5m_input_tokens !== undefined || cc.ephemeral_1h_input_tokens !== undefined);
  const w5 = hasBreakdown ? (cc?.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0);
  const w1 = hasBreakdown ? (cc?.ephemeral_1h_input_tokens ?? 0) : 0;
  const read = u.cache_read_input_tokens ?? 0;
  let rate: Rate;
  if (model === "claude-sonnet-5-5") rate = SONNET;
  else if (model === "claude-haiku-5-5") rate = u.input_tokens + w5 + w1 + read > 100_000 ? HAIKU_LARGE : HAIKU_SMALL;
  else return null;
  const micro = u.input_tokens * rate.input + w5 * rate.cacheWrite5m + w1 * rate.cacheWrite1h + read * rate.cacheRead + u.output_tokens * rate.output;
  return Math.round(micro * 1e6) / 1e12;
}
