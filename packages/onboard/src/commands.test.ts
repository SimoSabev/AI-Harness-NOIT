import { describe, expect, it } from "vitest";
import { classifyCommand } from "./commands.js";

describe("command-allowlist (т. 8.2)", () => {
  it("разрешени", () => {
    for (const c of ["npx vitest run", "pnpm test", "npm ci --ignore-scripts", "yarn jest", "bun test", "node --test", "node_modules/.bin/vitest run", "./node_modules/.bin/jest"]) expect([c, classifyCommand(c)]).toEqual([c, "allowed"]);
  });
  it("забранени: curl, wget, sh -c, |, ;, &&, $(, >", () => {
    for (const c of ["curl https://x", "wget x", "sh -c 'x'", "npm test | tee x", "npm test; rm -rf /", "npm ci && npm test", "npm test $(id)", "npm test > out", "npm test `id`", "npm test || true"]) expect([c, classifyCommand(c)]).toEqual([c, "forbidden"]);
  });
  it("иначе needs_human", () => {
    for (const c of ["make test", "python -m pytest", "", "./run-tests.sh"]) expect([c, classifyCommand(c)]).toEqual([c, "needs_human"]);
  });
});
