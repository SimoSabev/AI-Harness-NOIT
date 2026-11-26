import { postSwitchAccount } from "../../../../../lib/server/api";
import { routeDeps } from "../../../../../lib/server/admin";
import { agentsView } from "../../../../../lib/server/connections";
import { accountLimits } from "../../../../../lib/server/conversation";
import { db } from "../../../../../lib/server/db";

export const dynamic = "force-dynamic";
// D-628: the agents offered are the task box's own (agentsView), with the accounts in their limit marked
export const POST = async (req: Request, ctx: { params: Promise<{ id: string }> }) =>
  postSwitchAccount(req, routeDeps(), (await ctx.params).id, async (org) => (await agentsView("en", process.env, await accountLimits(db(), org))).agents);
