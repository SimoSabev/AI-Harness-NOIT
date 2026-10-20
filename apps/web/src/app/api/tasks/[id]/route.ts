import { getTask } from "../../../../lib/server/api";
import { routeDeps } from "../../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const GET = async (req: Request, ctx: { params: Promise<{ id: string }> }) => getTask(req, routeDeps(), (await ctx.params).id);
