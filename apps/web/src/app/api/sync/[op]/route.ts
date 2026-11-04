import { handleSync } from "../../../../lib/server/account/sync-api";
import { syncServerSide } from "../../../../lib/server/account/wiring";

// D-491: the sync API, only on the sync server; a device's bearer token only.
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ op: string }> };
const handle = async (req: Request, ctx: Ctx): Promise<Response> => {
  const s = syncServerSide();
  return s ? handleSync((await ctx.params).op, req, s.api) : Response.json({ error: "not_found" }, { status: 404 });
};
export const GET = handle;
export const POST = handle;
