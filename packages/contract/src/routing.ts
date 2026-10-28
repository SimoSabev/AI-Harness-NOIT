import { z } from "zod";
import { ModelRole } from "./profile.js";

// E9в (spec 5.3, D-420): roles by model — routing_rules.role sends each role of a task to its own channel. The roles are
// the profile's (layer H, ModelRole): lead = the agent that does the task; subagent = its helpers; research = the research
// engine; review = the advisor (E9б); summary = short texts (titles, digests).

/** One row of routing_rules as the channel selection sees it (packages/channels selectChannel). */
export const ChannelRule = z.object({
  mode: z.enum(["fixed", "auto"]),
  channel_id: z.string().min(1).nullable(),
  fallback_ids: z.array(z.string().min(1)).max(8),
  role: ModelRole.default("lead"),
}).strict().refine((r) => r.mode !== "fixed" || r.channel_id !== null, { message: "a fixed rule names its channel", path: ["channel_id"] });
export type ChannelRule = z.infer<typeof ChannelRule>;

/** The rule for a role: its own, else the lead rule (one rule serves every role), else auto. */
export function ruleForRole(rules: readonly ChannelRule[], role: ModelRole): ChannelRule {
  return rules.find((r) => r.role === role) ?? rules.find((r) => r.role === "lead") ?? { mode: "auto", channel_id: null, fallback_ids: [], role: "lead" };
}
