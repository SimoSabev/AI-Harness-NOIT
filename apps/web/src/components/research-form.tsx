"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RESEARCH_ROLES, depthBudget } from "@mandat/contract";
import type { ResearchDepth, ResearchGoal, ResearchRole, ResearchScope } from "@mandat/contract";
import { useT } from "../i18n/client";
import { errorText, postJson } from "../lib/client/api";
import type { ResearchChannel } from "../lib/research-types";
import { btn, card, input, label } from "./ui";

// E9d (D-398): a new research question — what, how deep, how to spend on models; the rest folded under "More options".
const DEPTHS: readonly ResearchDepth[] = ["quick", "standard", "deep"];
const GOALS: readonly ResearchGoal[] = ["economy", "balanced", "quality"];
const SCOPES: readonly ResearchScope[] = ["web", "docs", "code", "papers"];
const hosts = (s: string) => s.split(/[\s,]+/).map((x) => x.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean);

function Segmented<V extends string>({ name, value, options, onChange, text, hint }: { name: string; value: V; options: readonly V[]; onChange: (v: V) => void; text: (v: V) => string; hint: (v: V) => string }) {
  return (
    <fieldset>
      <legend className={label}>{name}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <label key={o} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm transition ${value === o ? "border-accent-text bg-accent-soft" : "border-line-strong hover:bg-raised"}`}>
            <input type="radio" className="sr-only" name={name} checked={value === o} onChange={() => onChange(o)} />
            <span className="block font-medium">{text(o)}</span>
            <span className="mt-0.5 block text-xs text-mute">{hint(o)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ResearchForm({ channels }: { channels: ResearchChannel[] }) {
  const t = useT();
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [depth, setDepth] = useState<ResearchDepth>("standard");
  const [goal, setGoal] = useState<ResearchGoal>("balanced");
  const [instructions, setInstructions] = useState("");
  const [routing, setRouting] = useState<Partial<Record<ResearchRole, string>>>({});
  const [scopes, setScopes] = useState<ResearchScope[]>(["web"]);
  const [include, setInclude] = useState("");
  const [exclude, setExclude] = useState("");
  const [recency, setRecency] = useState<"any" | "year" | "month" | "week">("any");
  const [budget, setBudget] = useState("");
  const [robots, setRobots] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usable = channels.filter((c) => c.enabled && c.health !== "down");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      question: question.trim(), depth, goal, instructions: instructions.trim(), routing, scopes, include_domains: hosts(include), exclude_domains: hosts(exclude), recency, respect_robots: robots,
      ...(budget.trim() !== "" && Number(budget) > 0 ? { budget_usd: Number(budget) } : {}),
    };
    const r = await postJson("/api/research", body);
    setBusy(false);
    if (r.status === 201 && typeof r.body.id === "string") router.push(`/research?q=${r.body.id}`);
    else setError(errorText(t, r));
  };

  return (
    <form onSubmit={(e) => void submit(e)} className={`${card} rise flex flex-col gap-5 p-5`}>
      <label className="block">
        <span className={label}>{t("research.form.question")}</span>
        <textarea required maxLength={2000} rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("research.form.placeholder")} className={`${input} mt-2 resize-y text-[15px]`} />
      </label>
      <Segmented name={t("research.form.depth")} value={depth} options={DEPTHS} onChange={setDepth} text={(d) => t(`research.depth.${d}`)} hint={(d) => t(`research.depthHint.${d}`)} />
      <Segmented name={t("research.form.goal")} value={goal} options={GOALS} onChange={setGoal} text={(g) => t(`research.goal.${g}`)} hint={(g) => t(`research.goalHint.${g}`)} />
      {usable.length === 0 && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">{t("research.form.noModels")}</p>}
      <details className="group">
        <summary className="cursor-pointer text-sm text-mute hover:text-ink">{t("research.form.advanced")}</summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className={label}>{t("research.form.instructions")}</span>
            <textarea maxLength={2000} rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={t("research.form.instructionsHint")} className={`${input} mt-2`} />
          </label>
          <fieldset className="md:col-span-2">
            <legend className={label}>{t("research.form.models")}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {RESEARCH_ROLES.map((role) => (
                <label key={role} className="block text-sm">
                  <span className="text-xs text-mute">{t(`research.role.${role}`)}</span>
                  <select value={routing[role] ?? ""} onChange={(e) => setRouting((r) => { const n = { ...r }; if (e.target.value) n[role] = e.target.value; else delete n[role]; return n; })} className={`${input} mt-1`}>
                    <option value="">{t("research.form.auto")}</option>
                    {usable.map((c) => <option key={c.id} value={c.id}>{c.label} · {c.model}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className={label}>{t("research.form.scopes")}</legend>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              {SCOPES.map((s) => (
                <label key={s} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={scopes.includes(s)} onChange={(e) => setScopes((cur) => (e.target.checked ? [...cur, s] : cur.filter((x) => x !== s).length > 0 ? cur.filter((x) => x !== s) : cur))} />
                  {t(`research.scope.${s}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className={label}>{t("research.form.recency")}</span>
            <select value={recency} onChange={(e) => setRecency(e.target.value as typeof recency)} className={`${input} mt-2`}>
              {(["any", "year", "month", "week"] as const).map((r) => <option key={r} value={r}>{t(`research.recency.${r}`)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={label}>{t("research.form.include")}</span>
            <input value={include} onChange={(e) => setInclude(e.target.value)} placeholder={t("research.form.domainsHint")} className={`${input} mt-2`} />
          </label>
          <label className="block">
            <span className={label}>{t("research.form.exclude")}</span>
            <input value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder={t("research.form.domainsHint")} className={`${input} mt-2`} />
          </label>
          <label className="block">
            <span className={label}>{t("research.form.budget")}</span>
            <input type="number" min="0.01" max="20" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} className={`${input} mt-2`} />
            <span className="mt-1 block text-xs text-mute">{t("research.form.budgetHint", { usd: `$${depthBudget(depth).usd.toFixed(2)}` })}</span>
          </label>
          <label className="inline-flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={robots} onChange={(e) => setRobots(e.target.checked)} />
            {t("research.form.robots")}
          </label>
        </div>
      </details>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <div>
        <button type="submit" disabled={busy || question.trim() === ""} className={btn.primary}>{busy ? t("research.form.sending") : t("research.form.submit")}</button>
      </div>
    </form>
  );
}
