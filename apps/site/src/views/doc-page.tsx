import type { ReactNode } from "react";
import { Diagram } from "../components/diagrams";
import { Frame } from "../components/frame";
import { Rich } from "../components/rich";
import { Shot } from "../components/shot";
import { card, label, link } from "../components/ui";
import { pagePath, translator } from "../i18n/t";
import type { Lang, T } from "../i18n/t";
import { DOCS, DOC_SLUGS, docNeighbours, docPath, docSections } from "../lib/docs";
import type { Block, Cell, DocSlug } from "../lib/docs";
import { reasonText } from "../lib/reasons";
import { DOCKER_MIN } from "../lib/requirements";

// E9g B step 7 (D-378): one docs page — the side list of all pages, the page's blocks (lib/docs.ts), and the links to
// the previous and the next page. The same renderer for English and Bulgarian.

const VERDICT_TONE = { VERIFIED: "bg-ok-soft text-ok", UNKNOWN: "bg-warn-soft text-warn", FAILED: "bg-bad-soft text-bad" } as const;

function DocsNav({ lang, current }: { lang: Lang; current: DocSlug | null }) {
  const t = translator(lang);
  return (
    <nav aria-label={t("docs.nav")} className="md:sticky md:top-6">
      <a href={pagePath(lang, "/docs/")} aria-current={current === null ? "page" : undefined} className={`${label} block px-3 py-1 hover:text-ink aria-[current=page]:text-accent-text`}>
        {t("docs.title")}
      </a>
      <ul className="mt-2 flex flex-wrap gap-1 md:flex-col md:gap-0.5">
        {DOC_SLUGS.map((s) => (
          <li key={s}>
            <a
              href={pagePath(lang, docPath(s))}
              aria-current={s === current ? "page" : undefined}
              className="block rounded-lg px-3 py-1.5 text-sm text-mute transition hover:bg-raised hover:text-ink aria-[current=page]:bg-accent-soft aria-[current=page]:text-ink"
            >
              {t(DOCS[s].title)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function CellView({ cell, lang, t }: { cell: Cell; lang: Lang; t: T }) {
  if (typeof cell === "string") return <Rich text={t(cell)} />;
  if ("code" in cell) return <code className="whitespace-nowrap font-mono text-[0.9em] text-ink">{cell.code}</code>;
  if ("verdict" in cell) return <span className={`inline-block rounded-full px-2.5 py-0.5 font-display text-xs font-semibold tracking-wide ${VERDICT_TONE[cell.verdict]}`}>{t(`verdict.${cell.verdict}`)}</span>;
  return <q className="text-mute">{reasonText(cell.reason, lang)}</q>;
}

function BlockView({ block, lang, t }: { block: Block; lang: Lang; t: T }): ReactNode {
  if ("h2" in block)
    return (
      <h2 id={block.id} className="mt-10 scroll-mt-6 font-display text-xl font-semibold tracking-wide">
        {t(block.h2)}
      </h2>
    );
  if ("p" in block)
    return (
      <p className="mt-3 leading-relaxed">
        <Rich text={t(block.p)} />
      </p>
    );
  if ("ul" in block)
    return (
      <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
        {block.ul.map((k) => (
          <li key={k}>
            <Rich text={t(k)} />
          </li>
        ))}
      </ul>
    );
  if ("code" in block)
    return (
      <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-raised px-4 py-3 font-mono text-sm text-ink">
        <code>{block.code}</code>
      </pre>
    );
  if ("requirements" in block)
    return (
      <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
        <li>{t("req.docker", { version: DOCKER_MIN })}</li>
        <li>{t("req.disk")}</li>
        <li>{t("req.cpu")}</li>
      </ul>
    );
  if ("table" in block)
    return (
      <div className={`${card} mt-4 overflow-x-auto`}>
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
          <caption className={`${label} px-4 pt-3 text-left`}>{t(block.table.caption)}</caption>
          <thead>
            <tr className="border-b border-line">
              {block.table.head.map((h) => (
                <th key={h} scope="col" className="px-4 py-2 font-display font-medium text-mute">
                  {t(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.table.rows.map((row, i) => (
              <tr key={i} className="border-b border-line align-top last:border-0">
                {row.map((c, j) =>
                  j === 0 ? (
                    <th key={j} scope="row" className="px-4 py-3 font-normal">
                      <CellView cell={c} lang={lang} t={t} />
                    </th>
                  ) : (
                    <td key={j} className="px-4 py-3 leading-relaxed">
                      <CellView cell={c} lang={lang} t={t} />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  if ("diagram" in block) return <Diagram name={block.diagram} t={t} />;
  if ("shot" in block) return <Shot name={block.shot} lang={lang} alt={t(block.alt)} caption={t(block.caption)} />;
  return (
    <div className="mt-4 space-y-3">
      {block.faq.map(([q, a]) => (
        <section key={q} className={`${card} p-5`} aria-labelledby={`q-${q.slice(9)}`}>
          <h2 id={`q-${q.slice(9)}`} className="font-display text-lg font-semibold tracking-wide">
            {t(q)}
          </h2>
          <p className="mt-2 leading-relaxed text-mute">
            <Rich text={t(a)} />
          </p>
        </section>
      ))}
    </div>
  );
}

function Layout({ lang, current, children }: { lang: Lang; current: DocSlug | null; children: ReactNode }) {
  return (
    <Frame lang={lang} page={current ? docPath(current) : "/docs/"}>
      <div className="grid gap-8 md:grid-cols-[13rem_minmax(0,1fr)]">
        <aside>
          <DocsNav lang={lang} current={current} />
        </aside>
        <article className="min-w-0 max-w-3xl">{children}</article>
      </div>
    </Frame>
  );
}

export function DocPage({ lang, slug }: { lang: Lang; slug: DocSlug }) {
  const t = translator(lang);
  const page = DOCS[slug];
  const sections = docSections(slug);
  const { prev, next } = docNeighbours(slug);
  return (
    <Layout lang={lang} current={slug}>
      <h1 className="font-display text-3xl font-semibold leading-tight tracking-wide">{t(page.title)}</h1>
      <p className="mt-4 text-lg text-mute">{t(page.lead)}</p>
      {sections.length > 2 && (
        <nav aria-label={t("docs.onThisPage")} className="mt-6 rounded-xl border border-line px-4 py-3">
          <p className={label}>{t("docs.onThisPage")}</p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <a className={link} href={`#${s.id}`}>
                  {t(s.key)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {page.blocks.map((b, i) => (
        <BlockView key={i} block={b} lang={lang} t={t} />
      ))}
      <nav aria-label={`${t("docs.prev")} / ${t("docs.next")}`} className="mt-12 flex flex-wrap justify-between gap-3 border-t border-line pt-6 text-sm">
        {prev ? (
          <a className={link} href={pagePath(lang, docPath(prev))}>
            ← {t("docs.prev")}: {t(DOCS[prev].title)}
          </a>
        ) : (
          <span />
        )}
        {next && (
          <a className={link} href={pagePath(lang, docPath(next))}>
            {t("docs.next")}: {t(DOCS[next].title)} →
          </a>
        )}
      </nav>
    </Layout>
  );
}

export function DocsIndexPage({ lang }: { lang: Lang }) {
  const t = translator(lang);
  return (
    <Layout lang={lang} current={null}>
      <h1 className="font-display text-3xl font-semibold leading-tight tracking-wide">{t("docs.title")}</h1>
      <p className="mt-4 text-lg text-mute">{t("docs.lead")}</p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {DOC_SLUGS.map((s) => (
          <li key={s}>
            <a href={pagePath(lang, docPath(s))} className={`${card} block h-full p-5 transition hover:border-line-strong hover:bg-raised`}>
              <span className="font-display text-lg font-semibold tracking-wide text-ink">{t(DOCS[s].title)}</span>
              <span className="mt-2 block text-sm text-mute">{t(DOCS[s].lead)}</span>
            </a>
          </li>
        ))}
      </ul>
    </Layout>
  );
}
