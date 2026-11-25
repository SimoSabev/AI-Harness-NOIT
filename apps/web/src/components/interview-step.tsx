"use client";
import { useState } from "react";
import type { T } from "../i18n/t";
import { answerText } from "../lib/interview";
import type { Answer, Question } from "../lib/interview";
import { btn } from "./ui";

// D-600: one question of the interview at a time, large — answers to pick as cards (one, or several when the model
// says so) and "Other…" for the person's own words; Back, Skip, Next; the last step sends all answers as one message.
export function InterviewStep({ questions, t, busy, onSend }: { questions: Question[]; t: T; busy: boolean; onSend: (text: string) => void }) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>(() => questions.map(() => ({ picked: [], other: "" })));
  const [otherOpen, setOtherOpen] = useState(false);
  const q = questions[i];
  const a = answers[i] ?? { picked: [], other: "" };
  if (!q) return null;
  const last = i === questions.length - 1;
  const set = (next: Answer) => setAnswers((all) => all.map((x, k) => (k === i ? next : x)));
  const toggle = (o: string) => set({ ...a, picked: q.multi ? (a.picked.includes(o) ? a.picked.filter((x) => x !== o) : [...a.picked, o]) : a.picked[0] === o ? [] : [o] });
  const go = (d: number) => {
    setOtherOpen(false);
    if (last && d > 0) return onSend(answerText(questions, answers, t("interview.skipped")));
    setI((x) => Math.max(0, Math.min(questions.length - 1, x + d)));
  };
  const free = q.options.length === 0;
  return (
    <section aria-label={t("interview.question", { n: i + 1, of: questions.length })} className="flex flex-col gap-5 rounded-[14px] border border-line-strong bg-canvas p-5 lg:p-6">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-mute">{t("interview.question", { n: i + 1, of: questions.length })}</span>
        <span aria-hidden="true" className="flex flex-1 gap-1">
          {questions.map((_, k) => <span key={k} className={`h-1.5 flex-1 rounded-full ${k < i ? "bg-accent" : k === i ? "bg-accent-text" : "bg-line-strong"}`} />)}
        </span>
      </div>
      <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.015em] text-balance lg:text-4xl">{q.text}</h2>
      {!free && <p className="text-base text-mute">{t(q.multi ? "interview.pickMany" : "interview.pickOne")}</p>}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {q.options.map((o, k) => {
          const on = a.picked.includes(o);
          return (
            <button key={o} type="button" aria-pressed={on} onClick={() => toggle(o)}
              className={`flex min-h-14 items-center gap-3 rounded-[10px] border px-4 py-4 text-left text-lg transition ${on ? "border-2 border-accent bg-accent-soft" : "border-line-strong bg-panel hover:bg-raised"}`}>
              <span className="font-mono text-xs text-mute">{k + 1}</span>
              <span className="flex-1">{o}</span>
              {on && <span aria-hidden="true" className="text-accent-text">✓</span>}
            </button>
          );
        })}
        {!free && !otherOpen && a.other === "" && (
          <button type="button" onClick={() => setOtherOpen(true)} className="min-h-14 rounded-[10px] border border-dashed border-line-strong px-4 py-4 text-left text-lg text-mute hover:bg-raised">{t("interview.other")}</button>
        )}
      </div>
      {(free || otherOpen || a.other !== "") && (
        <label className="block">
          <span className="sr-only">{t("interview.otherLabel")}</span>
          <textarea autoFocus={!free} rows={free ? 3 : 2} value={a.other} onChange={(e) => set({ ...a, other: e.target.value })} placeholder={t("interview.otherPlaceholder")}
            className="w-full resize-none rounded-[10px] border border-line-strong bg-panel px-4 py-3 text-lg outline-none focus:border-accent" />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn.ghost} onClick={() => go(-1)} disabled={i === 0 || busy}>{t("interview.back")}</button>
        <button type="button" className={btn.ghost} onClick={() => { set({ picked: [], other: "" }); go(1); }} disabled={busy}>{t("interview.skip")}</button>
        <span className="flex-1" />
        <button type="button" className={`${btn.primary} px-6 py-2.5 text-base`} onClick={() => go(1)} disabled={busy}>{t(last ? "interview.send" : "interview.next")}</button>
      </div>
    </section>
  );
}
