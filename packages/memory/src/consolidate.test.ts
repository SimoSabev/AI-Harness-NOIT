import { describe, expect, it } from "vitest";
import { conflictsWith, consolidationPlan } from "./consolidate.js";
import { REPO, mem } from "./items.test-helper.js";

describe("обновяване при запис: противоречия (D-392)", () => {
  it("нов мениджър на пакети замества стария в същия обхват", () => {
    const old = mem("Ползвам npm за всичко", { kind: "preference" });
    const fresh = mem("Вече ползвам pnpm", { kind: "preference" });
    expect(conflictsWith(fresh, [old])).toEqual([old.id]);
  });
  it("език на отговорите: български ↔ английски", () => {
    const old = mem("Отговаряй на английски", { kind: "preference" });
    expect(conflictsWith(mem("Отговаряй на български", { kind: "preference" }), [old])).toEqual([old.id]);
  });
  it("не е противоречие: друг обхват, друг проект, неактивен, или споменава две стойности", () => {
    const fresh = mem("Тестовете са с vitest", { scope: "project", repo_id: REPO });
    expect(conflictsWith(fresh, [mem("Тестовете са с jest")])).toEqual([]);
    expect(conflictsWith(fresh, [mem("Тестовете са с jest", { scope: "project", repo_id: REPO, status: "invalid" })])).toEqual([]);
    expect(conflictsWith(fresh, [mem("Минахме от jest на vitest", { scope: "project", repo_id: REPO })])).toEqual([]);
    expect(conflictsWith(mem("Минахме от jest на vitest", { scope: "project", repo_id: REPO }), [mem("Тестовете са с jest", { scope: "project", repo_id: REPO })])).toEqual([]);
    expect(conflictsWith(fresh, [mem("Docker върви на Colima", { scope: "project", repo_id: REPO })])).toEqual([]);
  });
});

describe("консолидация", () => {
  it("точен и почти дубликат → пази по-ползвания (или по-стария), другия архивира", () => {
    const a = mem("Ползвам pnpm за тестовете", { uses: 3 });
    const b = mem("ползвам PNPM за тестовете!");
    const c = mem("За тестовете ползвам pnpm");
    const p = consolidationPlan([a, b, c], new Date("2026-10-26T00:00:00Z"));
    expect(p.duplicates).toEqual([{ keep: a.id, drop: b.id }, { keep: a.id, drop: c.id }]);
  });
  it("закаченият винаги остава", () => {
    const a = mem("Ползвам pnpm за тестовете", { uses: 9 });
    const b = mem("Ползвам pnpm за тестовете", { pinned: true });
    expect(consolidationPlan([a, b], new Date("2026-10-26T00:00:00Z")).duplicates).toEqual([{ keep: b.id, drop: a.id }]);
  });
  it("противоречията в паметта → по-старият става невалиден", () => {
    const old = mem("Ползвам npm", { kind: "preference", created_at: "2026-09-01T00:00:00.000Z" });
    const fresh = mem("Ползвам bun", { kind: "preference", created_at: "2026-10-01T00:00:00.000Z" });
    expect(consolidationPlan([fresh, old], new Date("2026-10-26T00:00:00Z")).supersede).toEqual([{ old: old.id, by: fresh.id }]);
  });
  it("неползвано над 60 дни → предложение за архив (не автоматично); закачено никога", () => {
    const now = new Date("2026-12-31T00:00:00Z");
    const stale = mem("Нещо старо и неползвано", { created_at: "2026-09-01T00:00:00.000Z" });
    const usedLately = mem("Нещо старо но ползвано", { created_at: "2026-09-01T00:00:00.000Z", uses: 2, last_used_at: "2026-12-20T00:00:00.000Z" });
    const pinned = mem("Закачено старо", { created_at: "2026-09-01T00:00:00.000Z", pinned: true });
    const young = mem("Ново", { created_at: "2026-12-30T00:00:00.000Z" });
    expect(consolidationPlan([stale, usedLately, pinned, young], now).stale).toEqual([stale.id]);
  });
});
