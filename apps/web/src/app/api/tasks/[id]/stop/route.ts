import { postStop } from "../../../../../lib/server/api";
import { routeDeps } from "../../../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const POST = async (req: Request, ctx: { params: Promise<{ id: string }> }) => postStop(req, routeDeps(), (await ctx.params).id);
