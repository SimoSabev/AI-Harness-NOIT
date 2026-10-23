import { describe, expect, it } from "vitest";
import { addedContent, inline, parseMarkdown } from "./markdown";

describe("parseMarkdown: блокове", () => {
  it("заглавия, параграфи, хоризонтална линия", () => {
    expect(parseMarkdown("# Заглавие\n\nПърви ред\nвтори ред\n\n---\n### Трето")).toEqual([
      { kind: "heading", level: 1, text: "Заглавие" },
      { kind: "para", text: "Първи ред\nвтори ред" },
      { kind: "hr" },
      { kind: "heading", level: 3, text: "Трето" },
    ]);
  });
  it("списъци с точки и номера, с отстъп за вложени", () => {
    expect(parseMarkdown("- а\n- б\n  - в\n\n1. едно\n2. две")).toEqual([
      { kind: "list", ordered: false, items: [{ text: "а", depth: 0 }, { text: "б", depth: 0 }, { text: "в", depth: 1 }] },
      { kind: "list", ordered: true, items: [{ text: "едно", depth: 0 }, { text: "две", depth: 0 }] },
    ]);
  });
  it("таблица: заглавен ред, разделител, редове", () => {
    expect(parseMarkdown("| Агент | Вид |\n|---|:---:|\n| Claude Code | код |\n| Devin | облак |")).toEqual([
      { kind: "table", head: ["Агент", "Вид"], rows: [["Claude Code", "код"], ["Devin", "облак"]] },
    ]);
  });
  it("цитат и блок с код (съдържанието на кода не се тълкува)", () => {
    expect(parseMarkdown("> **Важно.** Провери.\n\n```ts\nconst a = '**не**';\n```")).toEqual([
      { kind: "quote", text: "**Важно.** Провери." },
      { kind: "code", lang: "ts", text: "const a = '**не**';" },
    ]);
  });
  it("незатворен блок с код стига до края", () => {
    expect(parseMarkdown("```\nx")).toEqual([{ kind: "code", lang: "", text: "x" }]);
  });
});

describe("inline", () => {
  it("удебелен, курсив, код, връзка", () => {
    expect(inline("**Определение:** какво е `agent` и *защо*; [MCP](https://modelcontextprotocol.io)")).toEqual([
      { kind: "strong", text: "Определение:" },
      { kind: "text", text: " какво е " },
      { kind: "code", text: "agent" },
      { kind: "text", text: " и " },
      { kind: "em", text: "защо" },
      { kind: "text", text: "; " },
      { kind: "link", text: "MCP", href: "https://modelcontextprotocol.io" },
    ]);
  });
  it("опасни връзки остават текст", () => {
    expect(inline("[x](javascript:alert(1))")).toEqual([{ kind: "text", text: "[x](javascript:alert(1))" }]);
    expect(inline("[x](data:text/html,hi)")).toEqual([{ kind: "text", text: "[x](data:text/html,hi)" }]);
  });
  it("обикновен текст и единична звезда", () => {
    expect(inline("2 * 3 = 6")).toEqual([{ kind: "text", text: "2 * 3 = 6" }]);
  });
});

describe("addedContent: съдържанието на нов файл от diff-а", () => {
  it("само за добавен файл", () => {
    expect(addedContent({ kind: "added", lines: [{ kind: "hunk", text: "@@ -0,0 +1,2 @@" }, { kind: "add", text: "+# Х" }, { kind: "add", text: "+ред" }] })).toBe("# Х\nред");
    expect(addedContent({ kind: "modified", lines: [{ kind: "add", text: "+a" }] })).toBeNull();
  });
});
