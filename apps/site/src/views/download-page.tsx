import { Frame } from "../components/frame";
import { btn, card, label } from "../components/ui";
import { translator } from "../i18n/t";
import type { Lang } from "../i18n/t";
import { downloadRows, releaseManifest } from "../lib/downloads";
import type { DownloadRow } from "../lib/downloads";
import { platformAnchor } from "../lib/os";
import { DOCKER_MIN } from "../lib/requirements";
import type { Platform } from "../lib/os";

const PLATFORMS: readonly Platform[] = ["mac", "windows", "linux"];

// E9g B (D-377): "/download" — every installer with its SHA-256 (apps/site/releases.json), what you need, the phone.
export function DownloadPage({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const m = releaseManifest();
  const rows = downloadRows(m);
  return (
    <Frame lang={lang} page="/download/">
      <h1 className="font-display text-3xl font-semibold tracking-wide">{t("download.title")}</h1>
      <p className="mt-4 max-w-3xl text-lg text-mute">{t("download.intro")}</p>
      <p className="mt-2 text-sm text-mute">{m.version ? t("download.version", { version: m.version }) : t("download.soonHint")}</p>

      <div className="mt-8 grid gap-4">
        {PLATFORMS.map((p) => (
          <section key={p} id={platformAnchor(p)} className={`${card} scroll-mt-6 p-5`} aria-labelledby={`h-${p}`}>
            <h2 id={`h-${p}`} className="font-display text-xl font-semibold tracking-wide">{t(`os.${p}`)}</h2>
            <ul className="mt-3 divide-y divide-line">
              {rows.filter((r) => r.platform === p).map((r) => <Row key={r.kind} row={r} lang={lang} />)}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-6 max-w-3xl text-sm text-mute">
        {t("download.verify", { mac: "shasum -a 256 <file>", win: "Get-FileHash <file>" })}
      </p>
      <p className="mt-2 max-w-3xl text-sm text-mute">{t("download.unsigned")}</p>

      <section className="mt-10 max-w-3xl" aria-labelledby="req">
        <h2 id="req" className={label}>{t("req.title")}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>{t("req.docker", { version: DOCKER_MIN })}</li>
          <li>{t("req.disk")}</li>
          <li>{t("req.cpu")}</li>
        </ul>
      </section>

      <section id={platformAnchor("phone")} className={`${card} mt-10 max-w-3xl scroll-mt-6 p-5`} aria-labelledby="h-phone">
        <h2 id="h-phone" className="font-display text-xl font-semibold tracking-wide">{t("phone.title")}</h2>
        <p className="mt-3">{t("phone.p1")}</p>
        <p className="mt-2 text-mute">{t("phone.p2")}</p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>{t("phone.ios")}</li>
          <li>{t("phone.android")}</li>
        </ul>
      </section>
    </Frame>
  );
}

function Row({ row, lang }: { row: DownloadRow; lang: Lang }) {
  const t = translator(lang);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <span className="min-w-56 flex-1">{t(`asset.${row.kind}`)}</span>
      {row.asset ? (
        <>
          <span className="w-full break-all font-mono text-xs text-mute sm:order-last">
            {t("download.sha")}: {row.asset.sha256}
          </span>
          <span className="text-sm text-mute">{t("download.size", { size: row.asset.sizeMb })}</span>
          <a className={btn.primary} href={row.asset.url} aria-label={t("download.get", { file: row.asset.file })}>
            {t("download.ctaAny")}
          </a>
        </>
      ) : (
        <span className="rounded-full bg-raised px-2.5 py-0.5 text-xs font-medium text-mute">{t("download.soon")}</span>
      )}
    </li>
  );
}
