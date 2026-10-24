import type { ReactNode } from "react";
import { SITE_RELEASE_REPO } from "@mandat/contract";
import { LANGS, pagePath, translator } from "../i18n/t";
import type { Lang, PagePath } from "../i18n/t";
import { btn, link } from "./ui";

// E9g B (D-377): header (logo, pages, language), main and footer of every page.
export function Frame({ lang, page, children }: { lang: Lang; page: PagePath; children: ReactNode }) {
  const t = translator(lang);
  const nav: { path: PagePath; label: string }[] = [
    { path: "/", label: t("nav.home") },
    { path: "/download/", label: t("nav.download") },
    { path: "/docs/", label: t("nav.docs") },
  ];
  const active = (p: PagePath) => (p === "/docs/" ? page.startsWith("/docs/") : p === page);
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-lg focus:bg-panel focus:px-3 focus:py-2">
        {t("nav.skip")}
      </a>
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <a href={pagePath(lang, "/")} className="flex items-center gap-2 font-display text-lg font-semibold tracking-wide">
            <span aria-hidden="true" className="hex inline-block h-6 w-7 bg-accent" />
            {t("brand.name")}
          </a>
          <nav aria-label={t("nav.label")} className="flex flex-1 items-center gap-1">
            {nav.map((n) => (
              <a key={n.path} href={pagePath(lang, n.path)} aria-current={active(n.path) ? "page" : undefined} className={`${btn.ghost} aria-[current=page]:text-ink`}>
                {n.label}
              </a>
            ))}
          </nav>
          <nav aria-label={t("lang.switch")} className="flex items-center gap-1 text-sm">
            {LANGS.map((l) => (
              <a key={l} href={pagePath(l, page)} hrefLang={l} lang={l} aria-current={l === lang ? "true" : undefined} className={`${btn.ghost} aria-[current=true]:text-accent-text`}>
                {t(`lang.name.${l}`)}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-10">
        {children}
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap gap-x-6 gap-y-1 px-4 py-6 text-sm text-mute">
          <span>{t("footer.license")}</span>
          <span>{t("footer.privacy")}</span>
          <a className={link} href={`https://github.com/${SITE_RELEASE_REPO}`}>
            {t("footer.source")}
          </a>
        </div>
      </footer>
    </>
  );
}
