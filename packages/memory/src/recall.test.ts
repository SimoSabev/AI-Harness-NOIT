import { describe, expect, it } from "vitest";
import { OTHER_REPO, REPO, mem } from "./items.test-helper.js";
import { searchMemory } from "./recall.js";

const items = [
  mem("Тестовете на магазина се пускат с pnpm vitest", { scope: "project", repo_id: REPO, kind: "command" }),
  mem("Кодът за отстъпка SAVE10 дава 10% в количката", { scope: "project", repo_id: REPO }),
  mem("Docker върви на Colima, не на Docker Desktop", { kind: "fact" }),
  mem("Отговаряй кратко и на български", { kind: "preference" }),
  mem("Друг проект: тестовете са с jest", { scope: "project", repo_id: OTHER_REPO }),
  mem("Старо: тестовете се пускат с npm test", { scope: "project", repo_id: REPO, status: "invalid" }),
  mem("Чака одобрение: тестовете са бавни", { scope: "project", repo_id: REPO, status: "pending" }),
];

describe("хибридно търсене (D-392)", () => {
  it("думи в друга форма намират спомена (тестът ↔ тестовете)", () => {
    const r = searchMemory(items, "как се пуска тестът?", { repoId: REPO });
    expect(r[0]?.item.text).toBe("Тестовете на магазина се пускат с pnpm vitest");
    expect(r[0]?.why).toContain("words");
  });
  it("същност (инструмент) намира спомена и без обща дума", () => {
    const r = searchMemory(items, "colima", { repoId: REPO });
    expect(r.map((x) => x.item.text)).toEqual(["Docker върви на Colima, не на Docker Desktop"]);
    expect(r[0]?.why).toEqual(expect.arrayContaining(["words", "entities"]));
  });
  it("само активни; само този проект и потребителя; друг проект не се вижда", () => {
    const texts = searchMemory(items, "тестовете", { repoId: REPO }).map((x) => x.item.text);
    expect(texts).toContain("Тестовете на магазина се пускат с pnpm vitest");
    expect(texts).not.toContain("Друг проект: тестовете са с jest");
    expect(texts).not.toContain("Старо: тестовете се пускат с npm test");
    expect(texts).not.toContain("Чака одобрение: тестовете са бавни");
  });
  it("без проект: само обхват user", () => {
    expect(searchMemory(items, "отстъпка SAVE10", { repoId: null })).toEqual([]);
  });
  it("въздържане: нищо общо → празно (не „най-близкото“)", () => {
    expect(searchMemory(items, "рецепта за баница", { repoId: REPO })).toEqual([]);
  });
  it("лимит и бюджет в токени", () => {
    const many = Array.from({ length: 30 }, (_, i) => mem(`Бележка ${i} за количката и отстъпката`, { scope: "project", repo_id: REPO }));
    expect(searchMemory(many, "количката", { repoId: REPO, limit: 5 })).toHaveLength(5);
    const tight = searchMemory(many, "количката", { repoId: REPO, limit: 20, budget: 40 });
    expect(tight.length).toBeGreaterThan(0);
    expect(tight.length).toBeLessThan(20);
  });
  it("при равни думи по-скоро ползваният и закаченият е по-напред", () => {
    const a = mem("Бележка за деплоя на сайта", { uses: 0 });
    const b = mem("Бележка за деплоя на сайта още", { uses: 9, last_used_at: "2026-10-25T10:00:00.000Z" });
    expect(searchMemory([a, b], "деплоя", { repoId: null, now: new Date("2026-10-26T00:00:00Z") })[0]?.item.id).toBe(b.id);
  });
});
