"use client";
import { createContext, useContext } from "react";
import { agentLabel } from "../lib/agents";
import type { Lang } from "../i18n/t";

// D-610: whose subscription runs what — the agents the box offers (with the account's email and its limit), shared with
// the conversation, the oracle and the job's roles so each says who runs it and whether that account is out of its limit.
interface Named { id: string; label: string; limitedUntil?: string | null | undefined }
const Names = createContext<ReadonlyMap<string, Named>>(new Map());

export function AgentNames({ agents, children }: { agents: readonly Named[]; children: React.ReactNode }) {
  return <Names.Provider value={new Map(agents.map((a) => [a.id, a]))}>{children}</Names.Provider>;
}

/** the agent as the person knows it (email of the account, else its own name) and until when it is limited */
export function useAgentName(lang: Lang): (id: string) => { label: string; limitedUntil: string | null } {
  const m = useContext(Names);
  return (id) => {
    const a = m.get(id);
    // an agent the box does not offer now (another computer, a signed-out account) keeps its plain name
    return { label: a?.label ?? agentLabel(id, lang), limitedUntil: a?.limitedUntil ?? null };
  };
}

/** a limit's reset, short, in the page's language */
export function whenShort(iso: string, lang: string): string {
  return new Date(iso).toLocaleString(lang === "bg" ? "bg-BG" : "en-GB", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}
