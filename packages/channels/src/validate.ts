import type { ChannelState } from "./select.js";

// Демо промпт т. 8.3 „Валидация“: checked when .mandat.yml is approved and on a manual switch (AUP, Ф3).
export type ChainError = "same_provider_cli_profile" | "two_api_keys_same_provider" | "unknown_label";
export const CHAIN_ERROR_TEXT: Record<ChainError, string> = {
  same_provider_cli_profile: "втори акаунт на същия доставчик не може да е резерва",
  two_api_keys_same_provider: "един API ключ на доставчик във веригата",
  unknown_label: "непознат канал",
};

export function validateChain(primaryLabel: string, fallbackLabels: string[], channels: ChannelState[]): { ok: true } | { ok: false; errors: { error: ChainError; label: string }[] } {
  const byLabel = new Map(channels.map((c) => [c.label, c]));
  const errors: { error: ChainError; label: string }[] = [];
  const primary = byLabel.get(primaryLabel);
  if (!primary) errors.push({ error: "unknown_label", label: primaryLabel });
  const chain: ChannelState[] = primary ? [primary] : [];
  for (const l of fallbackLabels) {
    const c = byLabel.get(l);
    if (!c) {
      errors.push({ error: "unknown_label", label: l });
      continue;
    }
    if (primary && c.kind === "cli_profile" && c.provider === primary.provider) errors.push({ error: "same_provider_cli_profile", label: l });
    chain.push(c);
  }
  const keys = new Map<string, number>();
  for (const c of chain.filter((x) => x.kind === "api_key")) keys.set(c.provider, (keys.get(c.provider) ?? 0) + 1);
  for (const [provider, n] of keys) if (n > 1) errors.push({ error: "two_api_keys_same_provider", label: provider });
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/** Manual switch (POST /api/tasks/:id/switch-channel): never a second subscription profile of the same provider. */
export function manualSwitchAllowed(from: ChannelState, to: ChannelState): boolean {
  if (from.id === to.id || !to.enabled) return false;
  return !(to.kind === "cli_profile" && to.provider === from.provider);
}
