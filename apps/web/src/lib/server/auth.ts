import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { readSession, sessionSecret, SESSION_COOKIE } from "./session";

// D-285: MANDAT_DEMO_DEV_AUTH=1 → the local login (session.ts); otherwise Supabase Auth (cookies via @supabase/ssr).
export type AuthMode = "dev" | "supabase" | "none";
export function authMode(env: Record<string, string | undefined> = process.env): AuthMode {
  if (env.MANDAT_DEMO_DEV_AUTH === "1") return "dev";
  return env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "supabase" : "none";
}

export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const c of list) jar.set(c.name, c.value, c.options);
        } catch {
          // Server Components cannot set cookies; the Route Handlers refresh them
        }
      },
    },
  });
}

/** The signed-in user's id (Server Components and Route Handlers). */
export async function currentUser(): Promise<string | null> {
  const mode = authMode();
  if (mode === "dev") return readSession((await cookies()).get(SESSION_COOKIE)?.value, sessionSecret());
  if (mode === "supabase") {
    const { data } = await (await supabaseServer()).auth.getUser();
    return data.user?.id ?? null;
  }
  return null;
}
