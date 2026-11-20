import { postVoiceSession } from "../../../../lib/server/api";
import { routeDeps } from "../../../../lib/server/admin";

export const dynamic = "force-dynamic";
// D-556: one voice session — a signed URL valid 15 minutes, never the key
export const POST = (req: Request) => postVoiceSession(req, routeDeps());
