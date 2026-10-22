import { getRoles, postRole } from "../../../lib/server/api";
import { routeDeps } from "../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => getRoles(req, routeDeps());
export const POST = (req: Request) => postRole(req, routeDeps());
