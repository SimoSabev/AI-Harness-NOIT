import { describe, expect, it } from "vitest";
import { overview, rhythm } from "./overview";
import type { OverviewTask } from "./overview";

const now = new Date("2026-10-21T18:00:00Z");
const t = (id: string, repo: string, state: string, o: Partial<OverviewTask> = {}): OverviewTask => ({
  id, repo_id: repo, text: id, agent: "claude", state, last_result: null, wait_reason: null, approval_needed: false, approved_by_human: false,
  updated_at: "2026-10-21T17:00:00Z", ...o,
});
const repos = [{ id: "r1", full_name: "acme/shop" }, { id: "r2", full_name: "acme/api" }, { id: "r3", full_name: "acme/docs" }];

describe("overview (D-305)", () => {
  it("потокът брои по етап; „чака теб“ е групата waiting; готово = последните 24 ч", () => {
    const o = overview([
      t("q", "r1", "CREATED"), t("run", "r1", "RUNNING"), t("chk", "r2", "VERIFY_1"),
      t("rev", "r1", "HELD", { last_result: "VERIFIED" }), t("bad", "r2", "BLOCKED", { last_result: "FAILED" }),
      t("ok", "r1", "DONE", { approved_by_human: true, last_result: "VERIFIED", updated_at: "2026-10-21T10:00:00Z" }),
      t("old", "r1", "DONE", { approved_by_human: true, last_result: "VERIFIED", updated_at: "2026-10-19T10:00:00Z" }),
    ], repos, now);
    expect(o.flow).toEqual({ queued: 1, running: 1, checking: 1, waiting: 2, done24h: 1 });
    expect(o.swarm.map((s) => s.tone)).toEqual(["red", "green", "blue", "blue", "gray"]);
  });

  it("проектите: провал → bad, чакащо → warn, работа → ok, нищо → idle; подредени по тежест", () => {
    const o = overview([t("rev", "r1", "HELD", { last_result: "VERIFIED" }), t("bad", "r2", "BLOCKED", { last_result: "FAILED" }), t("run", "r1", "RUNNING")], repos, now);
    expect(o.projects.map((p) => [p.name, p.health, p.word])).toEqual([
      ["api", "bad", "1 failed"], ["shop", "warn", "1 waiting for you"], ["docs", "idle", "quiet"],
    ]);
    const b = overview([t("rev", "r1", "HELD", { last_result: "VERIFIED" }), t("rev2", "r1", "HELD", { last_result: "VERIFIED" }), t("bad", "r2", "BLOCKED", { last_result: "FAILED" }), t("run", "r3", "RUNNING")], repos, now, "bg");
    expect(b.projects.map((p) => p.word)).toEqual(["1 с провал", "2 чакат теб", "1 работи"]);
    expect(b.swarm[0]?.label).toBe("Провал");
    const shop = o.projects[1];
    expect(shop?.items.map((i) => i.id)).toEqual(["rev", "run"]);
    expect(shop?.active).toBe(1);
  });

  it("задача без познато репо отива в „друго“; празно = празен списък", () => {
    expect(overview([t("x", "r9", "RUNNING")], repos, now).projects[0]?.name).toBe("other");
    expect(overview([t("x", "r9", "RUNNING")], repos, now, "bg").projects[0]?.name).toBe("друго");
    expect(overview([], [], now)).toEqual({ flow: { queued: 0, running: 0, checking: 0, waiting: 0, done24h: 0 }, projects: [], swarm: [] });
  });

  it("ритъм: 7 дни × 12 двучасови клетки, днешният ден е последен", () => {
    const r = rhythm([t("a", "r1", "DONE", { approved_by_human: true, last_result: "VERIFIED", updated_at: "2026-10-21T16:30:00Z" }), t("b", "r1", "BLOCKED", { last_result: "FAILED", updated_at: "2026-10-20T09:10:00Z" })], now);
    expect(r).toHaveLength(7);
    expect(r[6]?.cells).toHaveLength(12);
    expect(r[6]?.cells[8]).toEqual({ done: 1, bad: 0 });
    expect(r[5]?.cells[4]).toEqual({ done: 0, bad: 1 });
    expect(r[6]?.day).toBe("today");
    expect(r[5]?.day).toBe("Tue");
    const b = rhythm([], now, "bg");
    expect(b[6]?.day).toBe("днес");
    expect(b[5]?.day).toBe("вт");
  });
});
