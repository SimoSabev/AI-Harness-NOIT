import { getMemoryHistory } from "../../../../../lib/server/api";
import { routeDeps } from "../../../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const GET = async (req: Request, ctx: { params: Promise<{ id: string }> }) => getMemoryHistory(req, routeDeps(), decodeURIComponent((await ctx.params).id));
