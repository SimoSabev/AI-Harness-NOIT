import { postConnectionCheck } from "../../../../../lib/server/api";
import { routeDeps } from "../../../../../lib/server/admin";

export const dynamic = "force-dynamic";
// D-472: "Check the key" of a saved connection
export const POST = async (req: Request, { params }: { params: Promise<{ id: string }> }) => postConnectionCheck(req, routeDeps(), (await params).id);
