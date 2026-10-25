import { patchRole } from "../../../../lib/server/api";
import { routeDeps } from "../../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const PATCH = async (req: Request, ctx: { params: Promise<{ id: string }> }) => patchRole(req, routeDeps(), decodeURIComponent((await ctx.params).id));
