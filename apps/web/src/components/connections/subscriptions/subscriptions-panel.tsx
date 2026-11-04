"use client";
import { useState } from "react";
import type { SubscriptionId, SubscriptionStatus } from "@mandat/contract";
import { useT } from "../../../i18n/client";
import type { Key } from "../../../i18n/t";
import { AccountLogin, AccountLogout } from "../../account-login";
import { StatusBadge, btn, card } from "../../ui";
import { providerChoices, suggestAccountName } from "./subscriptions-view";
import type { ProviderChoice, SubscriptionCard } from "./subscriptions-view";

// D-462: Settings → Subscriptions as one self-contained section (the coordinator puts it on the shared Connections page).
// The cards are the signed-in subscriptions; "Add subscription" picks a provider from the registry (D-460) and runs its own
// sign-in (AccountLogin: the vendor's page, nothing kept here). A signed-in subscription shows up in the task box and in
// Settings → Models by itself (taskAgents, D-393).

const STATUS: Record<SubscriptionStatus, { label: Key; tone: "green" | "amber" | "gray" | "red" }> = {
  signed_in: { label: "subs.status.signed_in", tone: "green" },
  expired: { label: "subs.status.expired", tone: "amber" },
  no_cli: { label: "subs.status.no_cli", tone: "gray" },
  unavailable: { label: "subs.status.unavailable", tone: "gray" },
};
const WHY: Record<ProviderChoice["why"], Key> = { ready: "subs.why.ready", untested: "subs.why.untested", terms: "subs.why.terms", planned: "subs.why.planned" };

type Props = { cards: SubscriptionCard[]; canManage: boolean };

export function SubscriptionsPanel({ cards, canManage }: Props) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<SubscriptionId | null>(null);
  const [renew, setRenew] = useState<string | null>(null);
  const taken = cards.map((c) => c.name);
  const choices = providerChoices();
  const close = () => {
    setAdding(false);
    setPicked(null);
  };
  return (
    <section aria-labelledby="subs-h" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="subs-h" className="font-display text-lg font-semibold">{t("subs.title")}</h2>
        {canManage && !adding && <button type="button" className={btn.primary} onClick={() => setAdding(true)}>{t("subs.add")}</button>}
      </div>
      <p className="max-w-2xl text-sm text-mute">{t("subs.intro")}</p>

      {cards.length === 0 && !adding && <p className={`${card} p-5 text-sm text-mute`}>{t("subs.empty")}</p>}
      {cards.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cards.map((c) => {
            const s = STATUS[c.status];
            return (
              <li key={`${c.cli}-${c.name}`} className={`${card} flex flex-col gap-3 p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-display text-base font-semibold">{c.product}</span>
                    <span className="block truncate text-xs text-mute">{c.status === "signed_in" ? [c.who, c.plan].filter(Boolean).join(" · ") || c.name : t("subs.account", { name: c.name })}</span>
                  </span>
                  <StatusBadge tone={s.tone} label={t(s.label)} />
                </div>
                {c.status === "signed_in" && <p className="text-xs text-mute">{t("subs.agentReady", { agent: c.agent })}</p>}
                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    {c.status === "expired" && c.canSignInAgain && renew !== c.name && <button type="button" className={btn.secondary} onClick={() => setRenew(c.name)}>{t("subs.signInAgain")}</button>}
                    <AccountLogout name={c.name} cli={c.cli} />
                  </div>
                )}
                {renew === c.name && <AccountLogin suggested={c.name} cli={c.cli} onDone={() => setRenew(null)} />}
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <div className={`${card} space-y-4 p-5`}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-base font-semibold">{t(picked ? "subs.signInTo" : "subs.pick", { product: choices.find((p) => p.id === picked)?.label ?? "" })}</h3>
            <button type="button" className={btn.ghost} onClick={close}>{t("keys.login.cancel")}</button>
          </div>
          {picked === null ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {choices.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={!p.canSignIn}
                    onClick={() => setPicked(p.id)}
                    className="w-full rounded-xl border border-line p-3 text-left transition-colors enabled:hover:border-accent enabled:hover:bg-raised disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="block text-sm font-semibold">{p.label} <span className="font-normal text-mute">· {p.vendor}</span></span>
                    <span className="block text-xs text-mute">{p.plans}</span>
                    <span className={`mt-1 block text-xs ${p.canSignIn ? "text-ok" : "text-mute"}`}>{t(WHY[p.why])}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <>
              {picked === "codex" && <p className="text-sm text-mute">{t("subs.codexDevice")}</p>}
              <AccountLogin suggested={suggestAccountName(picked, taken)} cli={picked} onDone={close} />
            </>
          )}
        </div>
      )}
    </section>
  );
}
