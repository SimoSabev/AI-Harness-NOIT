import { getShot } from "../../../../../../lib/server/api";
import { routeDeps } from "../../../../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const GET = async (req: Request, ctx: { params: Promise<{ id: string; name: string }> }) => {
  const p = await ctx.params;
  return getShot(req, routeDeps(), p.id, p.name);
};
