import { describe, expect, it } from "vitest";
import { mem } from "./items.test-helper.js";
import { memoryAsOf, staleAgainstRepo } from "./temporal.js";
import type { TimedEvent } from "./temporal.js";

// Round 2: memory in time. A memory is valid from its creation until it is made invalid; its history (memory_events)
// says what its text and status were at any moment. "As of" a date replays that history — no new columns.
const ev = (action: string, at: string, o: { before?: unknown; after?: unknown } = {}): TimedEvent => ({ action, at, before: o.before ?? null, after: o.after ?? null });

describe("memoryAsOf", () => {
  it("shows a memory only from its creation and until it was made invalid", () => {
    const a = mem("uses pnpm", { created_at: "2026-11-01T10:00:00.000Z" });
    const b = mem("uses npm", { created_at: "2026-10-01T10:00:00.000Z", status: "invalid", invalid_at: "2026-11-01T10:00:00.000Z" });
    const at = (d: string) => memoryAsOf([a, b], {}, d).map((m) => m.text);
    expect(at("2026-10-15T00:00:00.000Z")).toEqual(["uses npm"]);
    expect(at("2026-11-02T00:00:00.000Z")).toEqual(["uses pnpm"]);
  });

  it("replays the history: the text as it was then, pending until approved, gone while archived", () => {
    const m = mem("tests run with vitest run", { created_at: "2026-11-01T10:00:00.000Z" });
    const h = {
      [m.id]: [
        ev("created", "2026-11-01T10:00:00.000Z", { after: { text: "tests run with jest", status: "pending" } }),
        ev("approved", "2026-11-02T10:00:00.000Z", { before: { status: "pending" } }),
        ev("edited", "2026-11-05T10:00:00.000Z", { before: { text: "tests run with jest" }, after: { text: "tests run with vitest run" } }),
        ev("archived", "2026-11-07T10:00:00.000Z", { before: { status: "active" } }),
        ev("restored", "2026-11-09T10:00:00.000Z", { before: { status: "archived" } }),
      ],
    };
    const at = (d: string) => memoryAsOf([m], h, d).map((x) => x.text);
    expect(at("2026-11-01T12:00:00.000Z")).toEqual([]);
    expect(at("2026-11-03T00:00:00.000Z")).toEqual(["tests run with jest"]);
    expect(at("2026-11-06T00:00:00.000Z")).toEqual(["tests run with vitest run"]);
    expect(at("2026-11-08T00:00:00.000Z")).toEqual([]);
    expect(at("2026-11-10T00:00:00.000Z")).toEqual(["tests run with vitest run"]);
  });

  it("a merged or superseded memory leaves at that moment; a bad date shows nothing", () => {
    const m = mem("deploys on friday", { created_at: "2026-11-01T10:00:00.000Z", status: "invalid", invalid_at: "2026-11-04T10:00:00.000Z" });
    const h = { [m.id]: [ev("created", "2026-11-01T10:00:00.000Z", { after: { text: "deploys on friday", status: "active" } }), ev("superseded", "2026-11-04T10:00:00.000Z", { after: { by: "x" } })] };
    expect(memoryAsOf([m], h, "2026-11-03T00:00:00.000Z")).toHaveLength(1);
    expect(memoryAsOf([m], h, "2026-11-05T00:00:00.000Z")).toHaveLength(0);
    expect(memoryAsOf([m], h, "nope")).toEqual([]);
  });
});

describe("staleAgainstRepo", () => {
  const repo = { files: new Set(["src/cart.ts", "tests/cart.spec.ts", "package.json"]), scripts: { test: "vitest run", lint: "eslint ." } };

  it("a project memory naming a file or a script the repository no longer has may be stale; the reason is named", () => {
    const ok = mem("the discount lives in `src/cart.ts`", { scope: "project", kind: "convention" });
    const gone = mem("money helpers are in src/money.ts and tested in tests/money.spec.ts", { scope: "project", kind: "fact" });
    const script = mem("run `pnpm typecheck` before lint, then `npm run lint`", { scope: "project", kind: "command" });
    const mine = mem("I like src/old.ts", { scope: "user" });
    expect(staleAgainstRepo([ok, gone, script, mine], repo)).toEqual([
      { id: gone.id, why: ["path:src/money.ts", "path:tests/money.spec.ts"] },
      { id: script.id, why: ["script:typecheck"] },
    ]);
  });

  it("only active memories are checked; urls and version numbers are not paths", () => {
    const url = mem("docs at https://example.com/a/b.html, node 24.22.0", { scope: "project" });
    const old = mem("helpers in src/gone.ts", { scope: "project", status: "archived" });
    expect(staleAgainstRepo([url, old], repo)).toEqual([]);
  });
});
