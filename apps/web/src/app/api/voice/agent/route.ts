import { postVoiceAgent } from "../../../../lib/server/api";
import { routeDeps } from "../../../../lib/server/admin";

export const dynamic = "force-dynamic";
// D-556: make (or update) the person's Jarvis agent at ElevenLabs, through the proxy
export const POST = (req: Request) => postVoiceAgent(req, routeDeps());
