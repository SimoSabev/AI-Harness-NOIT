import { describe, expect, it } from "vitest";
import { memoryBlock, renderCore } from "./core.js";
import { REPO, OTHER_REPO, mem } from "./items.test-helper.js";
import { estimateTokens } from "./text.js";

describe("замразеното ядро (D-400)", () => {
  it("само активни; „Ти“ = обхват user, „Проект“ = обхват project на този проект", () => {
    const items = [
      mem("Отговаряй на български", { kind: "preference" }),
      mem("Ползвам pnpm", { kind: "preference", status: "pending" }),
      mem("Тестовете са с vitest", { scope: "project", repo_id: REPO, kind: "command" }),
      mem("Друг проект ползва jest", { scope: "project", repo_id: OTHER_REPO }),
      mem("Стар факт", { status: "invalid" }),
    ];
    const c = renderCore(items, REPO);
    expect(c.user.map((x) => x.text)).toEqual(["Отговаряй на български"]);
    expect(c.project.map((x) => x.text)).toEqual(["Тестовете са с vitest"]);
    expect(renderCore(items, null).project).toEqual([]);
  });
  it("ред: закачени, после по вид (предпочитания → конвенции → команди → капани → факти), после употреба", () => {
    const items = [mem("факт а"), mem("капан б", { kind: "pitfall" }), mem("предпочитание в", { kind: "preference" }), mem("факт г", { uses: 5 }), mem("закачен факт", { pinned: true })];
    expect(renderCore(items, null).user.map((x) => x.text)).toEqual(["закачен факт", "предпочитание в", "капан б", "факт г", "факт а"]);
  });
  it("бюджетът се спазва: каквото не влиза, отива в dropped; заетостта е в проценти", () => {
    const items = Array.from({ length: 40 }, (_, i) => mem(`Предпочитание номер ${i} с малко повече текст за да заема място`, { kind: "preference" }));
    const c = renderCore(items, null, { user: 100, project: 100 });
    expect(c.tokens.user).toBeLessThanOrEqual(100);
    expect(c.user.length + c.dropped.length).toBe(40);
    expect(c.dropped.length).toBeGreaterThan(0);
    expect(c.fill.user).toBeGreaterThan(100);
  });
  it("хешът зависи от съдържанието, не от реда на входа", () => {
    const a = mem("едно"), b = mem("две");
    expect(renderCore([a, b], null).hash).toBe(renderCore([b, a], null).hash);
    expect(renderCore([a], null).hash).not.toBe(renderCore([a, b], null).hash);
    expect(renderCore([a, b], null).hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("блокът с памет за агента", () => {
  it("раздели само ако имат нещо; празна памет → null", () => {
    const core = renderCore([mem("Отговаряй на български"), mem("Тестовете са с vitest", { scope: "project", repo_id: REPO })], REPO);
    const b = memoryBlock(core, [mem("SAVE10 е кодът за отстъпка", { scope: "project", repo_id: REPO })]);
    expect(b?.text).toBe("About the person:\n- Отговаряй на български\nAbout this project:\n- Тестовете са с vitest\nRelevant to this task:\n- SAVE10 е кодът за отстъпка\n");
    expect(b?.tokens).toBe(estimateTokens(b?.text ?? ""));
    expect(b?.hash).toMatch(/^sha256:/);
    expect(memoryBlock(renderCore([], null), [])).toBeNull();
  });
  it("извадката не повтаря ядрото", () => {
    const x = mem("Отговаряй на български");
    const b = memoryBlock(renderCore([x], null), [x]);
    expect(b?.text).not.toContain("Relevant");
  });
});
