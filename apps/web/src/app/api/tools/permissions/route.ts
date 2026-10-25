import { postPermission } from "../../../../lib/server/api";
import { routeDeps } from "../../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const POST = async (req: Request) => postPermission(req, routeDeps());
