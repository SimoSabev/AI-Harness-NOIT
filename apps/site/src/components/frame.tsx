import type { ReactNode } from "react";
import { SITE_RELEASE_REPO } from "@mandat/contract";
import { LANGS, pagePath, translator } from "../i18n/t";
import type { Lang, PagePath } from "../i18n/t";
import { DownloadButton } from "./download-button";
import { link } from "./ui";

// E9g B (D-377), D-608: header (logo, pages, language, download), main and footer of every page — a sticky, quiet bar
// like a product site's; on a phone it wraps under the logo.
export function Frame({ lang, page, children, wide = false }: { lang: Lang; page: PagePath; children: ReactNode; wide?: boolean }) {
  const t = translator(lang);
  const nav: { path: PagePath; label: string }[] = [
    { path: "/", label: t("nav.home") },
    { path: "/download/", label: t("nav.download") },
    { path: "/docs/", label: t("nav.docs") },
  ];
  const active = (p: PagePath) => (p === "/docs/" ? page.startsWith("/docs/") : p === page);
  const width = wide ? "max-w-6xl" : "max-w-5xl";
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-30 focus:rounded-md focus:bg-panel focus:px-3 focus:py-2">
        {t("nav.skip")}
      </a>
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
        <div className={`mx-auto flex ${width} flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6`}>
          <a href={pagePath(lang, "/")} className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em]">
            <span aria-hidden="true" className="logo-mark inline-block size-6" />
            {t("brand.name")}
          </a>
          <nav aria-label={t("nav.label")} className="order-last flex w-full items-center gap-1 sm:order-none sm:w-auto sm:flex-1">
            {nav.map((n) => (
              <a key={n.path} href={pagePath(lang, n.path)} aria-current={active(n.path) ? "page" : undefined}
                className="rounded-md px-3 py-1.5 text-sm text-mute transition hover:bg-raised hover:text-ink aria-[current=page]:text-ink">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <nav aria-label={t("lang.switch")} className="flex items-center rounded-md border border-line p-0.5 text-xs">
              {LANGS.map((l) => (
                <a key={l} href={pagePath(l, page)} hrefLang={l} lang={l} aria-current={l === lang ? "true" : undefined}
                  className="rounded px-2 py-1 text-mute transition hover:text-ink aria-[current=true]:bg-raised aria-[current=true]:text-ink">
                  {t(`lang.name.${l}`)}
                </a>
              ))}
            </nav>
            <span className="hidden sm:inline-flex"><DownloadButton lang={lang} small /></span>
          </div>
        </div>
      </header>
      <main id="main" className={`mx-auto ${width} px-4 py-12 sm:px-6 sm:py-16`}>
        {children}
      </main>
      <footer className="border-t border-line">
        <div className={`mx-auto flex ${width} flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm text-mute sm:px-6`}>
          <span className="flex items-center gap-2 font-medium text-ink">
            <span aria-hidden="true" className="logo-mark inline-block size-5" />
            {t("brand.name")}
          </span>
          <span>{t("footer.license")}</span>
          <span>{t("footer.privacy")}</span>
          <a className={`${link} sm:ml-auto`} href={`https://github.com/${SITE_RELEASE_REPO}`}>
            {t("footer.source")}
          </a>
        </div>
      </footer>
    </>
  );
}
