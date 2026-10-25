import { describe, expect, it } from "vitest";
import { checksFromCommands } from "./checks.js";

// v5 E9б (D8): the profile's lint/typecheck commands become the checks; a {files} placeholder means the whole project
// (base and B run the same command, so the comparison stays fair).
describe("checksFromCommands (D8)", () => {
  it("lint and typecheck when present; {files} → .; nothing else", () => {
    expect(checksFromCommands({ lint: "npx eslint {files}", typecheck: "npx tsc --noEmit", test: "npx vitest run" })).toEqual([
      { name: "lint", command: "npx eslint ." },
      { name: "typecheck", command: "npx tsc --noEmit" },
    ]);
    expect(checksFromCommands({})).toEqual([]);
    expect(checksFromCommands({ typecheck: "tsc -p {files}/x" })).toEqual([{ name: "typecheck", command: "tsc -p ./x" }]);
  });
});
