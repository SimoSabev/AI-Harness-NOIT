import { describe, expect, it } from "vitest";
import { cleanTitle, groupTasks } from "./task-groups";

// D-613: the list of conversations in three groups — what waits for you, what runs, what is done — and titles without
// the model's "Goal:" prefix.
const row = (id: string, tone: "amber" | "red" | "blue" | "green" | "gray") => ({ id, href: `/?chat=${id}`, text: id, tone, label: "x", ago: "y" });

describe("task groups (D-613)", () => {
  it("waiting (amber and red) first, then running (blue), then done; each keeps its order", () => {
    const g = groupTasks([row("a", "gray"), row("b", "amber"), row("c", "blue"), row("d", "red"), row("e", "green")]);
    expect(g.map((x) => [x.id, x.items.map((i) => i.id)])).toEqual([["waiting", ["b", "d"]], ["running", ["c"]], ["done", ["a", "e"]]]);
  });
  it("an empty group is left out", () => {
    expect(groupTasks([row("a", "blue")]).map((x) => x.id)).toEqual(["running"]);
  });
  it("cleanTitle drops a leading Goal: / Цел: and spaces", () => {
    expect(cleanTitle("Goal: Добавяне на програма")).toBe("Добавяне на програма");
    expect(cleanTitle("Цел:   Каталог")).toBe("Каталог");
    expect(cleanTitle("Goals of the shop")).toBe("Goals of the shop");
  });
});
