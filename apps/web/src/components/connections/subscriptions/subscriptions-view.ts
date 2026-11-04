import { SUBSCRIPTIONS, SubscriptionId, canSignIn, subscriptionStatus } from "@mandat/contract";
import type { LoginMethod, SubscriptionStatus } from "@mandat/contract";

// D-462: the cards and the picker of Settings → Subscriptions, from the registry (D-460). Pure — the page and the tests share it.

export interface SubscriptionAccount { name: string; agent: string; cli: SubscriptionId; loggedIn: boolean; email: string | null; plan: string | null }
export interface SubscriptionCard {
  name: string;
  cli: SubscriptionId;
  /** the product name (never translated) */
  product: string;
  agent: string;
  who: string | null;
  plan: string | null;
  status: SubscriptionStatus;
  /** an expired login can be renewed from the card */
  canSignInAgain: boolean;
}

const ORDER: Record<SubscriptionStatus, number> = { signed_in: 0, expired: 1, no_cli: 2, unavailable: 3 };

export function subscriptionCards(accounts: readonly SubscriptionAccount[]): SubscriptionCard[] {
  return accounts
    .map((a) => ({
      name: a.name,
      cli: a.cli,
      product: SUBSCRIPTIONS[a.cli].label,
      agent: a.agent,
      who: a.email,
      plan: a.plan,
      status: subscriptionStatus(a.cli, { loggedIn: a.loggedIn }),
      canSignInAgain: canSignIn(a.cli),
    }))
    .sort((x, y) => ORDER[x.status] - ORDER[y.status]);
}

/** ready / untested: a sign-in is offered; terms: the vendor's terms are unclear or against it; planned: no CLI in the sandbox yet. */
export type ChoiceWhy = "ready" | "untested" | "terms" | "planned";
export interface ProviderChoice { id: SubscriptionId; label: string; vendor: string; plans: string; method: LoginMethod; canSignIn: boolean; why: ChoiceWhy; docs: string }

export function providerChoices(): ProviderChoice[] {
  const all = SubscriptionId.options.map((id): ProviderChoice => {
    const p = SUBSCRIPTIONS[id];
    const ok = canSignIn(id);
    const why: ChoiceWhy = ok ? (p.availability === "ready" ? "ready" : "untested") : p.availability === "planned" ? "planned" : "terms";
    return { id, label: p.label, vendor: p.vendor, plans: p.plans, method: p.login.method, canSignIn: ok, why, docs: p.docs };
  });
  return [...all.filter((c) => c.canSignIn), ...all.filter((c) => !c.canSignIn)];
}

/** The default account name for a new sign-in: "lichno" (+ "-<provider>" outside Claude), numbered when taken. */
export function suggestAccountName(id: SubscriptionId, taken: readonly string[]): string {
  const base = id === "claude" ? "lichno" : `lichno-${id === "codex" ? "chatgpt" : id}`;
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
