import { getMcpRegistry } from "../../../../lib/server/api";
import { routeDeps } from "../../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const GET = async (req: Request) => getMcpRegistry(req, routeDeps());
