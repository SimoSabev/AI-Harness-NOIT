import { deleteKeys, getKeys, postKeys } from "../../../lib/server/api";
import { routeDeps } from "../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => getKeys(req, routeDeps());
export const POST = (req: Request) => postKeys(req, routeDeps());
export const DELETE = (req: Request) => deleteKeys(req, routeDeps());
