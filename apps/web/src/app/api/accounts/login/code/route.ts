import { postLoginCode } from "../../../../../lib/server/api";
import { routeDeps } from "../../../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const POST = (req: Request) => postLoginCode(req, routeDeps());
