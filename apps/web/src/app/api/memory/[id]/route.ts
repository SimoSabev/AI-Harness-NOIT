import { deleteMemoryRoute, patchMemoryRoute } from "../../../../lib/server/api";
import { routeDeps } from "../../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const PATCH = async (req: Request, ctx: { params: Promise<{ id: string }> }) => patchMemoryRoute(req, routeDeps(), decodeURIComponent((await ctx.params).id));
export const DELETE = async (req: Request, ctx: { params: Promise<{ id: string }> }) => deleteMemoryRoute(req, routeDeps(), decodeURIComponent((await ctx.params).id));
