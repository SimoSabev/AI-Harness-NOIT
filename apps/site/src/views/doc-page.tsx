import type { ReactNode } from "react";
import { Diagram } from "../components/diagrams";
import { Frame } from "../components/frame";
import { Rich } from "../components/rich";
import { Shot } from "../components/shot";
import { card, h1, h2, label, lead, link } from "../components/ui";
import { pagePath, translator } from "../i18n/t";
import type { Lang, T } from "../i18n/t";
import { DOCS, DOC_SLUGS, docNeighbours, docPath, docSections } from "../lib/docs";
import type { Block, Cell, DocSlug } from "../lib/docs";
import { reasonText } from "../lib/reasons";
import { DOCKER_MIN } from "../lib/requirements";

// E9g B step 7 (D-378): one docs page — the side list of all pages, the page's blocks (lib/docs.ts), and the links to
// the previous and the next page. The same renderer for English and Bulgarian. D-606: a product's docs — a quiet sticky
// side list with the current page marked by the accent diamond, readable text (15–16 px, 1.75), framed code and tables.

const VERDICT_TONE = { VERIFIED: "bg-ok-soft text-ok", UNKNOWN: "bg-warn-soft text-warn", FAILED: "bg-bad-soft text-bad" } as const;

function DocsNav({ lang, current }: { lang: Lang; current: DocSlug | null }) {
  const t = translator(lang);
  return (
    <nav aria-label={t("docs.nav")} className="md:sticky md:top-20">
      <a href={pagePath(lang, "/docs/")} aria-current={current === null ? "page" : undefined} className={`${label} block px-3 py-1 hover:text-ink aria-[current=page]:text-ink`}>
        {t("docs.title")}
      </a>
      <ul className="mt-2 flex flex-wrap gap-1 md:flex-col md:gap-0.5">
        {DOC_SLUGS.map((s) => (
          <li key={s}>
            <a
              href={pagePath(lang, docPath(s))}
              aria-current={s === current ? "page" : undefined}
              className="group flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-mute transition hover:bg-raised hover:text-ink aria-[current=page]:bg-raised aria-[current=page]:text-ink"
            >
              <span aria-hidden="true" className="size-1.5 shrink-0 rotate-45 border-[1.5px] border-line-strong group-aria-[current=page]:border-accent group-aria-[current=page]:bg-accent" />
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
  if ("verdict" in cell) return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${VERDICT_TONE[cell.verdict]}`}>{t(`verdict.${cell.verdict}`)}</span>;
  return <q className="text-mute">{reasonText(cell.reason, lang)}</q>;
}

function BlockView({ block, lang, t }: { block: Block; lang: Lang; t: T }): ReactNode {
  if ("h2" in block)
    return (
      <h2 id={block.id} className={`mt-12 scroll-mt-20 ${h2}`}>
        {t(block.h2)}
      </h2>
    );
  if ("p" in block)
    return (
      <p className="mt-4 text-[15.5px] leading-[1.75] text-ink/90">
        <Rich text={t(block.p)} />
      </p>
    );
  if ("ul" in block)
    return (
      <ul className="mt-4 list-disc space-y-2 pl-5 text-[15.5px] leading-[1.75] marker:text-line-strong">
        {block.ul.map((k) => (
          <li key={k}>
            <Rich text={t(k)} />
          </li>
        ))}
      </ul>
    );
  if ("code" in block)
    return (
      <pre className="mt-4 overflow-x-auto rounded-[10px] border border-line bg-panel px-4 py-3.5 font-mono text-[13px] leading-6 text-ink">
        <code>{block.code}</code>
      </pre>
    );
  if ("requirements" in block)
    return (
      <ul className="mt-4 list-disc space-y-2 pl-5 text-[15.5px] leading-[1.75] marker:text-line-strong">
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
                <th key={h} scope="col" className="px-4 py-2.5 text-xs font-medium text-mute">
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
    <div className={`${card} mt-4 divide-y divide-line`}>
      {block.faq.map(([q, a]) => (
        <section key={q} className="p-5" aria-labelledby={`q-${q.slice(9)}`}>
          <h2 id={`q-${q.slice(9)}`} className="text-base font-semibold">
            {t(q)}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-mute">
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
      <div className="grid gap-10 md:grid-cols-[14rem_minmax(0,1fr)]">
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
      <h1 className={h1}>{t(page.title)}</h1>
      <p className={`mt-4 ${lead}`}>{t(page.lead)}</p>
      {sections.length > 2 && (
        <nav aria-label={t("docs.onThisPage")} className="mt-8 rounded-[10px] border border-line px-4 py-3">
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
      <nav aria-label={`${t("docs.prev")} / ${t("docs.next")}`} className="mt-16 grid gap-3 border-t border-line pt-8 sm:grid-cols-2">
        {prev ? (
          <a className={`${card} block p-4 transition hover:border-line-strong hover:bg-raised`} href={pagePath(lang, docPath(prev))}>
            <span className="block text-xs text-mute">← {t("docs.prev")}</span>
            <span className="mt-1 block text-sm font-medium text-ink">{t(DOCS[prev].title)}</span>
          </a>
        ) : (
          <span />
        )}
        {next && (
          <a className={`${card} block p-4 text-right transition hover:border-line-strong hover:bg-raised`} href={pagePath(lang, docPath(next))}>
            <span className="block text-xs text-mute">{t("docs.next")} →</span>
            <span className="mt-1 block text-sm font-medium text-ink">{t(DOCS[next].title)}</span>
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
      <h1 className={h1}>{t("docs.title")}</h1>
      <p className={`mt-4 ${lead}`}>{t("docs.lead")}</p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {DOC_SLUGS.map((s) => (
          <li key={s}>
            <a href={pagePath(lang, docPath(s))} className={`${card} block h-full p-5 transition hover:border-line-strong hover:bg-raised`}>
              <span className="text-base font-semibold text-ink">{t(DOCS[s].title)}</span>
              <span className="mt-2 block text-sm text-mute">{t(DOCS[s].lead)}</span>
            </a>
          </li>
        ))}
      </ul>
    </Layout>
  );
}
