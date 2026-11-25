import { Frame } from "../components/frame";
import { btn, card, h1, h2, lead } from "../components/ui";
import { translator } from "../i18n/t";
import type { Lang } from "../i18n/t";
import { downloadRows, releaseManifest } from "../lib/downloads";
import type { DownloadRow } from "../lib/downloads";
import { platformAnchor } from "../lib/os";
import { DOCKER_MIN } from "../lib/requirements";
import type { Platform } from "../lib/os";

const PLATFORMS: readonly Platform[] = ["mac", "windows", "linux"];

// E9g B (D-377), D-606: "/download" — every installer with its SHA-256 (apps/site/releases.json), what you need, the phone.
// One card per system with its mark; the checksum under each file, small.
const OS_ICON: Record<Platform, string> = {
  mac: "M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v9H4zM2 18h20M9 18l.5-1.5h5L15 18",
  windows: "M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z",
  linux: "M4 5h16v14H4zM7 9l3 3-3 3M12 15h5",
};
export function DownloadPage({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const m = releaseManifest();
  const rows = downloadRows(m);
  return (
    <Frame lang={lang} page="/download/">
      <h1 className={h1}>{t("download.title")}</h1>
      <p className={`mt-4 max-w-3xl ${lead}`}>{t("download.intro")}</p>
      <p className="mt-3 inline-flex rounded-full border border-line px-3 py-1 text-sm text-mute">{m.version ? t("download.version", { version: m.version }) : t("download.soonHint")}</p>

      <div className="mt-10 grid gap-4">
        {PLATFORMS.map((p) => (
          <section key={p} id={platformAnchor(p)} className={`${card} scroll-mt-20 p-6`} aria-labelledby={`h-${p}`}>
            <h2 id={`h-${p}`} className={`flex items-center gap-3 ${h2}`}>
              <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-[10px] bg-raised text-ink">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={OS_ICON[p]} /></svg>
              </span>
              {t(`os.${p}`)}
            </h2>
            <ul className="mt-3 divide-y divide-line">
              {rows.filter((r) => r.platform === p).map((r) => <Row key={r.kind} row={r} lang={lang} />)}
            </ul>
            {p === "mac" && rows.some((r) => r.platform === "mac" && r.asset) ? <MacInstall lang={lang} /> : null}
          </section>
        ))}
      </div>

      <p className="mt-6 max-w-3xl text-sm text-mute">
        {t("download.verify", { mac: "shasum -a 256 <file>", win: "Get-FileHash <file>" })}
      </p>
      <p className="mt-2 max-w-3xl text-sm text-mute">{t("download.unsigned")}</p>

      <section className="mt-12 max-w-3xl" aria-labelledby="req">
        <h2 id="req" className={h2}>{t("req.title")}</h2>
        <ul className="mt-4 space-y-2.5">
          {[t("req.docker", { version: DOCKER_MIN }), t("req.disk"), t("req.cpu")].map((x) => (
            <li key={x} className="flex gap-3"><span aria-hidden="true" className="mt-0.5 text-accent-text">✓</span><span>{x}</span></li>
          ))}
        </ul>
      </section>

      <section id={platformAnchor("phone")} className={`${card} mt-12 max-w-3xl scroll-mt-20 p-6`} aria-labelledby="h-phone">
        <h2 id="h-phone" className={h2}>{t("phone.title")}</h2>
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

const MAC_STEPS = ["install.mac.1", "install.mac.2", "install.mac.3", "install.mac.4", "install.mac.5"] as const;

// How to open the unsigned app (until Q-053 signing): the steps of macOS 15+, no Terminal needed.
function MacInstall({ lang }: { lang: Lang }) {
  const t = translator(lang);
  return (
    <div className="mt-4 border-t border-line pt-4">
      <h3 className="text-base font-semibold">{t("install.mac.title")}</h3>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5">
        {MAC_STEPS.map((k) => <li key={k}>{t(k)}</li>)}
      </ol>
    </div>
  );
}

function Row({ row, lang }: { row: DownloadRow; lang: Lang }) {
  const t = translator(lang);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
      <span className="min-w-56 flex-1 font-medium">{t(`asset.${row.kind}`)}</span>
      {row.asset ? (
        <>
          <span className="w-full break-all font-mono text-[11px] text-faint sm:order-last">
            {t("download.sha")}: {row.asset.sha256}
          </span>
          <span className="text-sm text-mute">{t("download.size", { size: row.asset.sizeMb })}</span>
          <a className={btn.primary} href={row.asset.url} aria-label={t("download.get", { file: row.asset.file })}>
            {t("download.ctaAny")}
          </a>
        </>
      ) : (
        <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-mute">{t("download.soon")}</span>
      )}
    </li>
  );
}
