import type { Metadata } from "next";
import { Live } from "../components/live";
import { PushControl } from "../components/push";
import { Shell } from "../components/shell";
import { TaskCard } from "../components/task-card";
import { pageTitle, summaryLine } from "../lib/inbox";
import { db } from "../lib/server/db";
import { canAct, pageCtx } from "../lib/server/page";
import { inbox } from "../lib/server/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const c = await pageCtx();
  return { title: pageTitle(c.waiting) };
}

// т. 8.1: начален екран = „Чака теб“ — най-старото отгоре; обобщение за последните 24 ч.
export default async function InboxPage() {
  const c = await pageCtx();
  const ib = await inbox(db(), c.uid, c.org);
  return (
    <Shell current="inbox" waiting={ib.items.length}>
      <h1>Чака теб</h1>
      <p className="summary">{summaryLine(ib.summary)}</p>
      <PushControl vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? null} />
      {ib.items.length === 0 ? (
        <p>Нищо не чака теб. Присъдите и вратата работят сами.</p>
      ) : (
        <ul className="cards">
          {ib.items.map((t) => (
            <li key={t.id}>
              <TaskCard t={t} canAct={canAct(c.role)} />
            </li>
          ))}
        </ul>
      )}
      <Live topic={`org:${c.org}:board`} since={new Date().toISOString()} realtime={c.realtime} />
    </Shell>
  );
}
