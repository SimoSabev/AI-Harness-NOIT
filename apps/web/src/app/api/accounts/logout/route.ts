import { postLogout } from "../../../../lib/server/api";
import { routeDeps } from "../../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const POST = (req: Request) => postLogout(req, routeDeps());
