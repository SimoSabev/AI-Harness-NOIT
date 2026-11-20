import { deleteVoiceKey, postVoiceKey } from "../../../../lib/server/api";
import { routeDeps } from "../../../../lib/server/admin";

export const dynamic = "force-dynamic";
// D-556: Jarvis's voice key (ElevenLabs) → the proxy, like the model keys
export const POST = (req: Request) => postVoiceKey(req, routeDeps());
export const DELETE = (req: Request) => deleteVoiceKey(req, routeDeps());
