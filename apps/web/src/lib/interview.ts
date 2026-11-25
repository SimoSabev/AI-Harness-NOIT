import type { ChatTurn } from "@mandat/contract";

// D-600: the interview in the pop-up, pure. The open questions are the last answer of the model when it asked and the
// person has not answered yet; each has its answers to pick (one or several) or none (free text). The person's answers
// go back as one message, numbered like the questions, so the model reads which answer is which.
export interface Question { text: string; options: string[]; multi: boolean }
export interface Answer { picked: string[]; other: string }

export function openQuestions(turns: readonly ChatTurn[]): { seq: number; questions: Question[] } | null {
  const last = turns.at(-1);
  if (!last || last.kind !== "assistant" || last.questions.length === 0) return null;
  return {
    seq: last.seq,
    questions: last.questions.map((text, i) => {
      const c = last.choices?.[i] ?? null;
      return { text, options: c?.options ?? [], multi: c?.multi ?? false };
    }),
  };
}

export function answerText(qs: readonly Question[], answers: readonly Answer[], skipped: string): string {
  return qs
    .map((q, i) => {
      const a = answers[i];
      const parts = [...(a?.picked ?? []), ...(a && a.other.trim() !== "" ? [a.other.trim()] : [])];
      return `${i + 1}. ${q.text}\n${parts.length > 0 ? parts.join("; ") : skipped}`;
    })
    .join("\n\n");
}
