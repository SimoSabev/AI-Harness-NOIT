import { describe, expect, it } from "vitest";
import { ruleFor } from "./channels.js";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_CHANNELS, DEMO_ORG_ID, DEMO_REPO_ID, seedChannels, seedMinimal } from "./seed.js";

// E9в (spec 5.3, D-420): routing_rules.role — a role's own rule, else the lead rule
describe("ruleFor by role (D-420)", () => {
  it("review has its own rule; summary follows lead; a bad role is refused by the database", async () => {
    const db = await pgliteDb();
    try {
      await seedMinimal(db, { remoteUrl: "file:///tmp/x" });
      await seedChannels(db);
      await db.query("insert into public.routing_rules (org_id, priority, match, channel_id, repo_id, mode, role) values ($1, 1, '{}', $2, $3, 'fixed', 'review')", [DEMO_ORG_ID, DEMO_CHANNELS.openai, DEMO_REPO_ID]);
      expect(await ruleFor(db, DEMO_ORG_ID, DEMO_REPO_ID, "bugfix", "review")).toEqual({ mode: "fixed", channel_id: DEMO_CHANNELS.openai, fallback_ids: [], role: "review" });
      expect(await ruleFor(db, DEMO_ORG_ID, DEMO_REPO_ID, "bugfix", "summary")).toEqual({ mode: "auto", channel_id: DEMO_CHANNELS.anthropic, fallback_ids: [DEMO_CHANNELS.openai], role: "lead" });
      expect(await ruleFor(db, DEMO_ORG_ID, DEMO_REPO_ID, "bugfix")).toMatchObject({ role: "lead", channel_id: DEMO_CHANNELS.anthropic });
      await expect(db.query("insert into public.routing_rules (org_id, priority, match, channel_id, role) values ($1, 2, '{}', $2, 'boss')", [DEMO_ORG_ID, DEMO_CHANNELS.openai])).rejects.toThrow();
    } finally {
      await db.end();
    }
  });
});
