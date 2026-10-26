import { postResearch } from "../../../lib/server/api";
import { routeDeps } from "../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const POST = async (req: Request) => postResearch(req, routeDeps());
