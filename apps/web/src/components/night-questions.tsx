"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../i18n/client";
import { errorText, postJson } from "../lib/client/api";
import type { NightView } from "../lib/workbench";
import { btn, input } from "./ui";

// v5 E9a (5.1 (2)): the morning — a parked task's question (what stopped it, what was tried, Mandat's proposal) with
// "Answer and continue" (a new attempt with the answer), "Close" and "Make a task".
function Question({ q }: { q: NightView["questions"][number] }) {
  const router = useRouter();
  const t = useT();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    const r = await postJson(`/api/night/questions/${q.id}/${path}`, body);
    setBusy(false);
    if (r.status !== 200) setError(errorText(t, r));
    else router.refresh();
  };
  const open = q.status === "open";
  return (
    <li className="space-y-2 rounded-lg bg-raised p-3 text-sm">
      <p className="font-medium">{q.text}</p>
      <p><span className="text-mute">{t("night.q.stopped")}</span> <span className="font-mono text-xs">{q.what_stopped}</span></p>
      {q.tried.length > 0 && <p className="text-xs text-mute">{t("night.q.tried")} {q.tried.join(" · ")}</p>}
      <p><span className="text-mute">{t("night.q.proposal")}</span> {q.proposal}</p>
      {q.status !== "open" && <p className="text-xs text-mute">{q.status === "answered" ? t("night.q.answered", { answer: q.answer ?? "" }) : t("night.q.closed")}</p>}
      {open && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void act("answer", { answer }); }}>
          <textarea className={`${input} min-h-16`} value={answer} maxLength={500} aria-label={t("night.q.answer")} placeholder={t("night.q.placeholder")} onChange={(e) => setAnswer(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={btn.primary} disabled={busy || answer.trim() === ""}>{t("night.q.continue")}</button>
            <button type="button" className={btn.ghost} disabled={busy} onClick={() => void act("close", {})}>{t("night.q.close")}</button>
            <Link className={btn.secondary} href={`/?text=${encodeURIComponent(`${q.text}\n\n${q.proposal}`.slice(0, 4000))}`}>{t("night.q.makeTask")}</Link>
          </div>
        </form>
      )}
      {error && <p role="alert" className="text-bad">{error}</p>}
    </li>
  );
}

export function NightQuestions({ questions }: { questions: NightView["questions"] }) {
  const t = useT();
  if (questions.length === 0) return <p className="p-4 text-sm text-mute">{t("night.q.none")}</p>;
  return <ul className="space-y-2 p-4">{questions.map((q) => <Question key={q.id} q={q} />)}</ul>;
}
