import { describe, expect, it } from "vitest";
import { fieldLabel, humanFields, sourceLabel } from "./harness-view";

describe("harness view (D-298)", () => {
  it("полетата и източниците с думи; непознатото остава както е", () => {
    expect(fieldLabel("tests.command")).toBe("Команда за тестовете");
    expect(fieldLabel("x.y")).toBe("x.y");
    expect(sourceLabel("lockfile")).toBe("от lockfile");
    expect(sourceLabel("human")).toBe("потвърди ти");
  });
  it("полетата, които човек трябва да потвърди, по азбучен ред", () => {
    expect(humanFields({ "runtime.node": "human", "tests.command": "package.json#scripts.test", "ci.workflow": "human" })).toEqual(["ci.workflow", "runtime.node"]);
  });
});
