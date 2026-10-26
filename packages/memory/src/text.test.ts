import { describe, expect, it } from "vitest";
import { entitiesOf, estimateTokens, normalizeKey, similarity, terms } from "./text.js";

describe("текст на паметта", () => {
  it("estimateTokens: латиница ~4 знака на токен, кирилица ~2 (консервативно); празно = 0", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd".repeat(10))).toBe(10);
    expect(estimateTokens("абвг".repeat(10))).toBe(20);
    expect(estimateTokens("use pnpm")).toBeGreaterThan(0);
  });
  it("terms: малки букви, без стоп думи, общ корен за форми на една дума (bg и en)", () => {
    expect(terms("Тестовете се пускат с Vitest")).toEqual(["тест", "пуск", "vitest"]);
    expect(terms("пуска")).toEqual(terms("пускат"));
    expect(terms("тестът")).toEqual(terms("тестове"));
    expect(terms("Running the tests")).toEqual(["runn", "test"]);
    expect(terms("и на за с the a of")).toEqual([]);
  });
  it("normalizeKey: без значение главни букви, интервали и пунктуация", () => {
    expect(normalizeKey("  Ползвам   PNPM! ")).toBe(normalizeKey("ползвам pnpm"));
  });
  it("similarity: Jaccard на корените; 1 за едно и също, 0 за нищо общо", () => {
    expect(similarity("ползвам pnpm за тестовете", "За тестовете ползвам pnpm")).toBe(1);
    expect(similarity("ползвам pnpm", "обичам котки")).toBe(0);
    expect(similarity("", "")).toBe(0);
  });
  it("entitiesOf: пътища, файлове, познати инструменти и `код`; уникални, до 20", () => {
    expect(entitiesOf("Тестовете в packages/core/src се пускат с `pnpm test`; виж README.md и Docker")).toEqual(["packages/core/src", "readme.md", "pnpm test", "pnpm", "docker"]);
    expect(entitiesOf("нищо особено")).toEqual([]);
    expect(entitiesOf(Array.from({ length: 30 }, (_, i) => `f${i}.ts`).join(" "))).toHaveLength(20);
  });
});
