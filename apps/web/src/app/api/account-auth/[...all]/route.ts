import { syncServerSide } from "../../../../lib/server/account/wiring";

// D-495: Better Auth, only on the sync server (MANDAT_SYNC_SERVER=1); everywhere else the path does not exist.
export const dynamic = "force-dynamic";
const handle = (req: Request): Promise<Response> | Response => {
  const s = syncServerSide();
  return s ? s.auth.handler(req) : Response.json({ error: "not_found" }, { status: 404 });
};
export const GET = handle;
export const POST = handle;
