import { describe, expect, it } from "vitest";
import { answerText, openQuestions } from "./interview";
import type { ChatTurn } from "@mandat/contract";

// D-600: the interview in the pop-up — one big question at a time, answers to pick (one or several) and "Other"; the
// answers go back as one message the model reads.
const at = "2026-11-24T10:00:00.000Z";
const asked = (seq: number, questions: string[], choices?: ({ options: string[]; multi: boolean } | null)[]) => ({ seq, at, kind: "assistant", text: "", questions, ...(choices ? { choices } : {}), brief: null, model: "m", usd: 0 }) as ChatTurn;

describe("the interview steps (D-600)", () => {
  it("the open questions are the last answer's, with their choices; free text when none", () => {
    const q = openQuestions([asked(1, ["Кой ползва магазина?", "Нещо друго?"], [{ options: ["Клиенти", "Персонал"], multi: true }, null])]);
    expect(q).toEqual({ seq: 1, questions: [{ text: "Кой ползва магазина?", options: ["Клиенти", "Персонал"], multi: true }, { text: "Нещо друго?", options: [], multi: false }] });
  });
  it("nothing is open once the person answered or when the last answer asked nothing", () => {
    expect(openQuestions([asked(1, ["?"]), { seq: 2, at, kind: "human", text: "да" } as ChatTurn])).toBeNull();
    expect(openQuestions([asked(1, [])])).toBeNull();
    expect(openQuestions([])).toBeNull();
  });
  it("the answers become one message: each question with what was picked and written; a skipped one says so", () => {
    const qs = [{ text: "Кой ползва магазина?", options: ["Клиенти", "Персонал"], multi: true }, { text: "Таван?", options: ["2 $", "5 $"], multi: false }, { text: "Нещо друго?", options: [], multi: false }];
    const text = answerText(qs, [{ picked: ["Клиенти", "Персонал"], other: "" }, { picked: [], other: "10 $" }, { picked: [], other: "" }], "(пропуснат)");
    expect(text).toBe("1. Кой ползва магазина?\nКлиенти; Персонал\n\n2. Таван?\n10 $\n\n3. Нещо друго?\n(пропуснат)");
  });
});
