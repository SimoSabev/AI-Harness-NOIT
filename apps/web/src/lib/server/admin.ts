import "server-only";
import { RateLimiter } from "./guard";
import type { ApiDeps } from "./api";
import { authMode, currentUser, supabaseServer } from "./auth";
import { db } from "./db";
import { controlKeys } from "./keys";
import { devSecondFactor } from "./session";

// Демо промпт т. 8 „Общо за E3“: the ONLY web module that reads SUPABASE_SERVICE_ROLE_KEY; imported only by
// app/api/**/route.ts (service-role-scope.test.ts). The key is used for the Realtime REST broadcast.
function broadcaster(): ApiDeps["broadcast"] {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return undefined;
  return async (topic, event, payload) => {
    const body = JSON.stringify({ messages: [{ topic, event, payload, private: true }] });
    if (body.length > 2048) return;
    await fetch(`${url.replace(/\/+$/, "")}/realtime/v1/api/broadcast`, { method: "POST", headers: { "content-type": "application/json", apikey: key, authorization: `Bearer ${key}` }, body, signal: AbortSignal.timeout(5000) });
  };
}

const createLimiter = new RateLimiter(10, 60_000);

export function routeDeps(): ApiDeps {
  const d = db();
  const b = broadcaster();
  const keys = controlKeys(process.env);
  const supabaseFactor: ApiDeps["secondFactor"] = async ({ code, factorId }) => {
    if (!factorId) return null;
    const sb = await supabaseServer();
    const ch = await sb.auth.mfa.challenge({ factorId });
    if (ch.error || !ch.data) return null;
    const v = await sb.auth.mfa.verify({ factorId, challengeId: ch.data.id, code });
    return v.error ? null : new Date();
  };
  return {
    db: d,
    user: () => currentUser(),
    secondFactor: authMode() === "dev" ? devSecondFactor(d) : supabaseFactor,
    ...(b ? { broadcast: b } : {}),
    ...(keys ? { keys } : {}),
    createLimiter,
  };
}
