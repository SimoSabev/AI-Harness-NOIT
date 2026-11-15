import { getFolders } from "../../../lib/server/api";
import { routeDeps } from "../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => getFolders(req, routeDeps());
