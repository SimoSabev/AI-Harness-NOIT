import { describe, expect, it } from "vitest";
import { fieldLabel, humanFields, proposalStatus, sourceLabel } from "./harness-view";

describe("harness view (D-298)", () => {
  it("полетата и източниците с думи; непознатото остава както е", () => {
    expect(fieldLabel("tests.command")).toBe("Test command");
    expect(fieldLabel("tests.command", "bg")).toBe("Команда за тестовете");
    expect(fieldLabel("x.y")).toBe("x.y");
    expect(sourceLabel("lockfile")).toBe("from the lockfile");
    expect(sourceLabel("lockfile", "bg")).toBe("от lockfile");
    expect(sourceLabel("human", "bg")).toBe("потвърди ти");
    expect(sourceLabel("odd")).toBe("odd");
    expect(proposalStatus("proposed", "bg")).toEqual({ label: "Чака одобрение", tone: "amber" });
    expect(proposalStatus("weird")).toEqual({ label: "weird", tone: "gray" });
  });
  it("полетата, които човек трябва да потвърди, по азбучен ред", () => {
    expect(humanFields({ "runtime.node": "human", "tests.command": "package.json#scripts.test", "ci.workflow": "human" })).toEqual(["ci.workflow", "runtime.node"]);
  });
});
