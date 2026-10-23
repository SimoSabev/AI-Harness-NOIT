import { postNightPlan } from "../../../lib/server/api";
import { routeDeps } from "../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const POST = async (req: Request) => postNightPlan(req, routeDeps());
