import type { Metadata } from "next";
import { Shell } from "../../components/shell";
import { pageTitle } from "../../lib/inbox";
import { listChannels } from "../../lib/server/channels";
import { db } from "../../lib/server/db";
import { pageCtx } from "../../lib/server/page";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const c = await pageCtx();
  return { title: `Канали · ${pageTitle(c.waiting)}` };
}

const HEALTH: Record<string, string> = { ok: "✔ работи", degraded: "! влошен", limited: "✖ лимит", down: "✖ недостъпен" };
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" }) : null);

// т. 8.3 (Ф3): само метаданни — ключовете са в env на проксито, никога в браузъра или в API-то.
export default async function ChannelsPage() {
  const c = await pageCtx();
  const list = await listChannels(db(), c.uid, c.org);
  return (
    <Shell current="channels" waiting={c.waiting}>
      <h1>Канали</h1>
      <p className="muted">Ключовете не се показват и не се пазят тук: те са само в средата на LLM проксито.</p>
      <table>
        <caption className="sr-only">Канали към модели</caption>
        <thead><tr><th scope="col">Канал</th><th scope="col">Доставчик · вид · модел</th><th scope="col">Състояние</th><th scope="col">Бюджет / ден</th><th scope="col">Изхарчено днес</th><th scope="col">Лимит</th></tr></thead>
        <tbody>
          {list.map((ch) => (
            <tr key={ch.id}>
              <td className="mono">{ch.label}{ch.enabled ? "" : " (изключен)"}</td>
              <td>{ch.provider} · {ch.kind} · <span className="mono">{ch.model}</span></td>
              <td>{HEALTH[ch.health] ?? ch.health}{ch.last_error ? ` · последна грешка ${ch.last_error}` : ""}</td>
              <td>{ch.budget_usd_day !== null ? `$${ch.budget_usd_day.toFixed(2)}` : "—"}</td>
              <td>${ch.spent_today_usd.toFixed(2)}</td>
              <td>{ch.limit_resets_at ? `нулира се в ${hhmm(ch.limit_resets_at)}` : ch.cooldown_until ? `пауза до ${hhmm(ch.cooldown_until)}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}
