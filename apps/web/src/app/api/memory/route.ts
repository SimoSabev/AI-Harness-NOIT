import { getMemory, postMemory } from "../../../lib/server/api";
import { routeDeps } from "../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => getMemory(req, routeDeps());
export const POST = (req: Request) => postMemory(req, routeDeps());
