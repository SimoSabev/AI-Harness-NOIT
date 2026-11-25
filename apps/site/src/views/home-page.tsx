import { DownloadButton } from "../components/download-button";
import { FlowDiagram } from "../components/flow-diagram";
import { Frame } from "../components/frame";
import { btn, card, h2 } from "../components/ui";
import { pagePath, translator } from "../i18n/t";
import type { Lang } from "../i18n/t";

// E9g B (D-377), D-606: "/" — the promise large, the way to download, then what Harnova does in three points (the sandbox,
// the verdict, the ledger), and the path of a task.
const POINTS = [
  { key: "home.s1", icon: "M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10" },
  { key: "home.s2", icon: "M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7zM9 12l2 2 4-4" },
  { key: "home.s3", icon: "M6 4h9l3 3v13H6zM9 10h6M9 14h6M9 18h4" },
] as const;

export function HomePage({ lang }: { lang: Lang }) {
  const t = translator(lang);
  return (
    <Frame lang={lang} page="/" wide>
      <section className="mx-auto max-w-3xl text-center">
        <span aria-hidden="true" className="logo-mark mx-auto mb-8 block size-14" />
        <h1 className="text-4xl font-semibold leading-[1.1] tracking-[-0.03em] text-balance sm:text-5xl">{t("home.title")}</h1>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <DownloadButton lang={lang} />
          <a className={`${btn.secondary} px-5 py-2.5 text-[15px]`} href={pagePath(lang, "/download/")}>{t("download.all")}</a>
        </div>
        <p className="mt-4 text-sm text-mute">{t("home.free")}</p>
      </section>

      <ul className="mt-20 grid gap-4 md:grid-cols-3">
        {POINTS.map((p) => (
          <li key={p.key} className={`${card} p-6`}>
            <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-[10px] bg-accent-soft text-accent-text">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={p.icon} /></svg>
            </span>
            <p className="mt-4 text-[15px] leading-relaxed text-ink">{t(p.key)}</p>
          </li>
        ))}
      </ul>

      <section className={`${card} mt-6 p-6 sm:p-8`} aria-labelledby="flow-heading">
        <h2 id="flow-heading" className={h2}>{t("home.flowTitle")}</h2>
        <div className="mt-6">
          <FlowDiagram t={t} />
        </div>
      </section>
    </Frame>
  );
}
