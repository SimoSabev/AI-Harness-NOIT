import { describe, expect, it } from "vitest";
import { initialModels } from "./connections-ui";

// D-393 (found in the browser check): a local server offers what it has installed, never a catalog name it lacks.
describe("initialModels (D-393)", () => {
  it("Ollama: the installed model that matches the recommended one, else the first installed", () => {
    expect(initialModels("ollama", ["llama3.2:3b", "qwen3-coder:30b"])).toEqual({ models: ["qwen3-coder:30b"], defaultModel: "qwen3-coder:30b" });
    expect(initialModels("ollama", ["llama3.2:3b"])).toEqual({ models: ["llama3.2:3b"], defaultModel: "llama3.2:3b" });
    expect(initialModels("ollama", [])).toEqual({ models: ["qwen3-coder"], defaultModel: "qwen3-coder" });
  });
  it("a key provider: the recommended catalog model", () => {
    expect(initialModels("deepseek", [])).toEqual({ models: ["deepseek-v4-pro"], defaultModel: "deepseek-v4-pro" });
  });
});
