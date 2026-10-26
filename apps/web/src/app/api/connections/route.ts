import { getConnections, postConnection } from "../../../lib/server/api";
import { routeDeps } from "../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => getConnections(req, routeDeps());
export const POST = (req: Request) => postConnection(req, routeDeps());
