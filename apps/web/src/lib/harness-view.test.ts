import { describe, expect, it } from "vitest";
import { fieldLabel, humanFields, pendingProfile, proposalStatus, sourceLabel } from "./harness-view";

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

describe("the agent profile waiting for approval (live test 17.11.2026, D-539)", () => {
  const v = (status: "proposed" | "approved" | "superseded", version: number) => ({ status, version });
  it("the newest version is proposed → its number; tasks stop until it is approved", () => {
    expect(pendingProfile([v("proposed", 3), v("approved", 2)])).toBe(3);
  });
  it("nothing waits when the newest version is approved, or there is no profile", () => {
    expect(pendingProfile([v("approved", 2), v("superseded", 1)])).toBeNull();
    expect(pendingProfile([])).toBeNull();
    expect(pendingProfile(undefined)).toBeNull();
  });
});
