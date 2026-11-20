import { postVoiceSession } from "../../../../lib/server/api";
import { routeDeps } from "../../../../lib/server/admin";
import { agentsView } from "../../../../lib/server/connections";
import { getLang } from "../../../../i18n/server";

export const dynamic = "force-dynamic";
// D-556: one voice session — a signed URL valid 15 minutes, never the key; plus the agent and model a conversation Jarvis
// starts uses (the person's remembered default, the first one that can run)
export async function POST(req: Request): Promise<Response> {
  const r = await postVoiceSession(req, routeDeps());
  if (r.status !== 200) return r;
  const body = (await r.json()) as Record<string, unknown>;
  const v = await agentsView(await getLang());
  const a = v.agents[0];
  const defaults = a ? { agent: a.id, model: v.prefs.defaultAgent === a.id && v.prefs.defaultModel ? v.prefs.defaultModel : a.defaultModel } : null;
  return Response.json({ ...body, defaults }, { headers: { "cache-control": "no-store" } });
}
