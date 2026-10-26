import { putPreferences } from "../../../lib/server/api";
import { routeDeps } from "../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const PUT = (req: Request) => putPreferences(req, routeDeps());
