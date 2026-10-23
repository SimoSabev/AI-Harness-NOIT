import "server-only";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { localOwner, localUser } from "./local-auth";
import { readSession, sessionSecret, SESSION_COOKIE } from "./session";

// D-368: MANDAT_LOCAL_OWNER → `pnpm local` without a login (local-auth.ts). D-285: MANDAT_DEMO_DEV_AUTH=1 → the demo
// login (session.ts); otherwise Supabase Auth (cookies via @supabase/ssr).
export type AuthMode = "local" | "dev" | "supabase" | "none";
export function authMode(env: Record<string, string | undefined> = process.env): AuthMode {
  if (localOwner(env)) return "local";
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
  if (mode === "local") return localUser(process.env, (await headers()).get("host"));
  if (mode === "dev") return readSession((await cookies()).get(SESSION_COOKIE)?.value, sessionSecret());
  if (mode === "supabase") {
    const { data } = await (await supabaseServer()).auth.getUser();
    return data.user?.id ?? null;
  }
  return null;
}
