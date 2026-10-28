import { deleteResearchKey, postResearchKey } from "../../../../lib/server/api";
import { routeDeps } from "../../../../lib/server/admin";

export const dynamic = "force-dynamic";
// D-440: the research search key (Exa) → the proxy, like the model keys
export const POST = (req: Request) => postResearchKey(req, routeDeps());
export const DELETE = (req: Request) => deleteResearchKey(req, routeDeps());
