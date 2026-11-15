"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../i18n/client";
import { errorText, postJson } from "../lib/client/api";
import { btn, input } from "./ui";
import { Select } from "./select";

// v5 E9a (5.1 (2)): the plan of a night — when, the budget, the rules and the queue. The worker starts it at the start
// time; a "now" start is a shift that starts at once.
const TYPES = ["free", "feature", "bugfix", "docs", "css"] as const;
const RISKS = ["low", "medium", "high"] as const;
type Row = { repo_id: string; text: string; type: (typeof TYPES)[number]; risk: (typeof RISKS)[number]; est_minutes: number; est_usd: number };

const tonight = (h: number) => {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
};

export function NightPlanForm({ repos }: { repos: { id: string; name: string }[] }) {
  const router = useRouter();
  const t = useT();
  const first = repos[0]?.id ?? "";
  const [start, setStart] = useState<"now" | "tonight">("tonight");
  const [hours, setHours] = useState(8);
  const [budget, setBudget] = useState(10);
  const [minLevel, setMinLevel] = useState(2);
  const [maxLines, setMaxLines] = useState(200);
  const [retries, setRetries] = useState(1);
  const [forbid, setForbid] = useState("");
  const [rows, setRows] = useState<Row[]>([{ repo_id: first, text: "", type: "free", risk: "low", est_minutes: 30, est_usd: 1 }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, p: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const starts = start === "now" ? new Date() : tonight(23);
    const ends = new Date(starts.getTime() + hours * 3600_000);
    const r = await postJson("/api/night", {
      starts_at: starts.toISOString(), ends_at: ends.toISOString(), budget_usd: budget,
      rules: { auto_merge: { min_level: minLevel, max_lines: maxLines }, on_fail: "retry_then_park", retries, same_file: "wait", forbid_tools: forbid.split(",").map((x) => x.trim()).filter(Boolean) },
      queue: rows.filter((r) => r.text.trim() !== "").map((r) => ({ ...r, text: r.text.trim() })),
    });
    setBusy(false);
    if (r.status !== 201) {
      setError(errorText(t, r));
      return;
    }
    router.refresh();
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4 p-4 text-sm" aria-labelledby="night-plan-h">
      <h2 id="night-plan-h" className="font-medium">{t("night.form.title")}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">{t("night.form.start")}
          <Select className="mt-1" value={start} onChange={(v) => setStart(v as "now" | "tonight")}
            options={[{ value: "tonight", label: t("night.form.tonight") }, { value: "now", label: t("night.form.now") }]} />
        </label>
        <label className="block">{t("night.form.hours")}<input className={`${input} mt-1`} type="number" min={1} max={14} value={hours} onChange={(e) => setHours(Number(e.target.value))} /></label>
        <label className="block">{t("night.form.budget")}<input className={`${input} mt-1`} type="number" min={0.5} step={0.5} value={budget} onChange={(e) => setBudget(Number(e.target.value))} /></label>
        <label className="block">{t("night.form.minLevel")}<input className={`${input} mt-1`} type="number" min={0} max={3} value={minLevel} onChange={(e) => setMinLevel(Number(e.target.value))} /></label>
        <label className="block">{t("night.form.maxLines")}<input className={`${input} mt-1`} type="number" min={0} max={2000} value={maxLines} onChange={(e) => setMaxLines(Number(e.target.value))} /></label>
        <label className="block">{t("night.form.retries")}<input className={`${input} mt-1`} type="number" min={0} max={3} value={retries} onChange={(e) => setRetries(Number(e.target.value))} /></label>
      </div>
      <label className="block">{t("night.form.forbid")}<input className={`${input} mt-1`} value={forbid} placeholder="bash:curl *, mcp:stripe.*" onChange={(e) => setForbid(e.target.value)} /></label>
      <fieldset className="space-y-2">
        <legend className="font-medium">{t("night.form.queue")}</legend>
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)_130px_110px_auto]">
            <Select aria-label={t("night.form.repo")} value={r.repo_id} onChange={(v) => set(i, { repo_id: v })} options={repos.map((p) => ({ value: p.id, label: p.name }))} />
            <input aria-label={t("night.form.task")} className={input} value={r.text} maxLength={4000} placeholder={t("night.form.taskPlaceholder")} onChange={(e) => set(i, { text: e.target.value })} />
            <Select aria-label={t("newTask.type")} value={r.type} onChange={(v) => set(i, { type: v as Row["type"] })} options={TYPES.map((x) => ({ value: x, label: t(`newTask.type.${x}`) }))} />
            <Select aria-label={t("night.form.risk")} value={r.risk} onChange={(v) => set(i, { risk: v as Row["risk"] })} options={RISKS.map((x) => ({ value: x, label: t(`night.risk.${x}`) }))} />
            <button type="button" className={btn.ghost} onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1}>{t("night.form.remove")}</button>
          </div>
        ))}
        <button type="button" className={btn.secondary} onClick={() => setRows([...rows, { repo_id: first, text: "", type: "free", risk: "low", est_minutes: 30, est_usd: 1 }])}>{t("night.form.add")}</button>
      </fieldset>
      {error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-bad">{error}</p>}
      <button type="submit" className={btn.primary} disabled={busy || repos.length === 0 || rows.every((r) => r.text.trim() === "")}>{busy ? t("night.form.saving") : t("night.confirm")}</button>
    </form>
  );
}
