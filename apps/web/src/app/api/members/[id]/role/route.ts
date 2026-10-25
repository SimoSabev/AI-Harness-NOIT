import { patchMemberRole } from "../../../../../lib/server/api";
import { routeDeps } from "../../../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const PATCH = async (req: Request, ctx: { params: Promise<{ id: string }> }) => patchMemberRole(req, routeDeps(), (await ctx.params).id);
