import { describe, expect, it } from "vitest";
import { BUILTIN_TOOLS, detectSource, sourceBody } from "./view";

// D-487: one box for "Add from…" — a person pastes whatever they have; we recognize it (and they can change the guess).
describe("Add from… recognizes the input", () => {
  it.each([
    ['{"mcpServers":{}}', "json"],
    ["https://github.com/acme/tools", "github"],
    ["acme/tools", "github"],
    ["https://smithery.ai/server/exa", "catalog"],
    ["smithery:exa", "catalog"],
    ["https://www.npmjs.com/package/@acme/x", "npm"],
    ["@acme/x-mcp@1.2.0", "npm"],
    ["x-mcp", "npm"],
    ["io.github.acme/notes", "registry"],
    ["https://mcp.example.com/mcp", "url"],
  ])("%s → %s", (input, source) => {
    expect(detectSource(input)).toBe(source);
  });
  it("builds the API body for each source", () => {
    expect(sourceBody("github", " acme/tools ")).toEqual({ source: "github", url: "acme/tools" });
    expect(sourceBody("url", "https://a.example/mcp")).toEqual({ source: "url", url: "https://a.example/mcp" });
    expect(sourceBody("json", "{}")).toEqual({ source: "json", text: "{}" });
    expect(sourceBody("catalog", "exa")).toEqual({ source: "catalog", input: "exa" });
    expect(sourceBody("npm", "x")).toEqual({ source: "npm", spec: "x" });
    expect(sourceBody("registry", "io.github.a/b")).toEqual({ source: "registry", name: "io.github.a/b" });
  });
  it("the built-in set names what is on: research, memory and the harness skills", () => {
    expect(BUILTIN_TOOLS.map((b) => b.name)).toEqual(["mandat", "research", "memory", "test-first", "review", "research-skill"]);
  });
});
