import { postPushSubscribe } from "../../../../lib/server/api";
import { routeDeps } from "../../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const POST = (req: Request) => postPushSubscribe(req, routeDeps());
