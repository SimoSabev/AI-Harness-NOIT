import { DownloadButton } from "../components/download-button";
import { FlowDiagram } from "../components/flow-diagram";
import { Frame } from "../components/frame";
import { btn, card, label } from "../components/ui";
import { pagePath, translator } from "../i18n/t";
import type { Lang } from "../i18n/t";

// E9g B (D-377): "/" — what the harness is in three sentences, the flow, and the download button.
export function HomePage({ lang }: { lang: Lang }) {
  const t = translator(lang);
  return (
    <Frame lang={lang} page="/">
      <section className="max-w-3xl">
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-wide sm:text-4xl">{t("home.title")}</h1>
        <div className="mt-6 space-y-3 text-lg text-mute">
          <p>{t("home.s1")}</p>
          <p>{t("home.s2")}</p>
          <p>{t("home.s3")}</p>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <DownloadButton lang={lang} />
          <a className={btn.secondary} href={pagePath(lang, "/download/")}>{t("download.all")}</a>
        </div>
        <p className="mt-3 text-sm text-mute">{t("home.free")}</p>
      </section>
      <section className={`${card} mt-12 p-6`} aria-labelledby="flow-heading">
        <h2 id="flow-heading" className={label}>{t("home.flowTitle")}</h2>
        <div className="mt-4">
          <FlowDiagram t={t} />
        </div>
      </section>
    </Frame>
  );
}
