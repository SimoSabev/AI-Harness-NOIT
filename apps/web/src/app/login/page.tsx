import type { Metadata } from "next";
import { Shell } from "../../components/shell";
import { authMode } from "../../lib/server/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Вход · Мандат" };

const ERR: Record<string, string> = { bad: "Грешен имейл или парола.", no_org: "Акаунтът не е член на организация.", origin: "Заявката не идва от този сайт.", off: "Входът не е настроен." };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const e = (await searchParams).e;
  const mode = authMode();
  return (
    <Shell current="login" waiting={null}>
      <h1>Вход</h1>
      {mode === "none" ? (
        <p>Входът не е настроен: задай NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY или MANDAT_DEMO_DEV_AUTH=1 (docs/setup/vercel.md).</p>
      ) : (
        <form className="login" action="/api/auth/login" method="post">
          {e && <p className="error" role="alert">{ERR[e] ?? "Входът не успя."}</p>}
          <label>Имейл<input name="email" type="email" autoComplete="username" required /></label>
          <label>Парола<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="btn primary" type="submit">Влез</button>
          {mode === "dev" && <p className="muted">Локален демо вход (MANDAT_DEMO_DEV_AUTH=1). Паролите са отпечатани веднъж от `pnpm mandat demo seed`.</p>}
        </form>
      )}
    </Shell>
  );
}
