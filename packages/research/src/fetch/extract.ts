import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

type Doc = ReturnType<typeof parseHTML>["document"];

// E9г (PRD 6.13 step 3): a page → its main text (Mozilla Readability over linkedom; no scripts run), the metadata a
// report needs (title, site, publish date, canonical URL, language), its links (for the crawler), and two signals for
// the fetch ladder: the page needs a browser (JS app shell) or the site answered with a bot wall.

export interface Extracted {
  title: string;
  text: string;
  published: string | null;
  site: string | null;
  lang: string | null;
  canonical: string | null;
  description: string | null;
  links: { url: string; text: string }[];
  needsBrowser: boolean;
  wall: boolean;
}

const BLOCKS = new Set(["P", "DIV", "SECTION", "ARTICLE", "LI", "UL", "OL", "TR", "TABLE", "BLOCKQUOTE", "PRE", "H1", "H2", "H3", "H4", "H5", "H6", "BR", "HR", "FIGCAPTION", "DT", "DD"]);
interface NodeLike {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<NodeLike>;
}
/** text with paragraph breaks, headings as "## …", list items as "- …" */
function blockText(root: NodeLike): string {
  let out = "";
  const walk = (n: NodeLike) => {
    if (n.nodeType === 3) {
      out += (n.textContent ?? "").replace(/\s+/g, " ");
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = n.nodeName.toUpperCase();
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEMPLATE") return;
    const block = BLOCKS.has(tag);
    if (block) out += "\n";
    if (/^H[1-6]$/.test(tag)) out += `${"#".repeat(Math.min(6, Number(tag[1]) + 1))} `;
    if (tag === "LI") out += "- ";
    for (const c of Array.from(n.childNodes)) walk(c);
    if (block) out += "\n";
  };
  walk(root);
  return out
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const WALL = /(just a moment\.\.\.|checking your browser|cf-chl-|challenge-platform|px-captcha|captcha-delivery|datadome|access denied|are you a robot|verify you are human|unusual traffic|enable javascript and cookies to continue)/i;
const APP_SHELL = /<div[^>]+id=["'](root|app|__next|__nuxt|svelte)["'][^>]*>\s*<\/div>/i;

function firstDate(doc: Doc): string | null {
  const metas = ["article:published_time", "og:published_time", "datePublished", "date", "dc.date", "DC.date.issued", "citation_publication_date", "pubdate", "article:modified_time"];
  for (const m of metas) {
    const el = doc.querySelector(`meta[property="${m}"],meta[name="${m}"],meta[itemprop="${m}"]`);
    const v = el?.getAttribute("content");
    if (v && !Number.isNaN(Date.parse(v))) return new Date(Date.parse(v)).toISOString().slice(0, 10);
  }
  for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json"]')) as { textContent: string | null }[]) {
    const m = /"datePublished"\s*:\s*"([^"]{6,40})"/.exec(s.textContent ?? "");
    if (m?.[1] && !Number.isNaN(Date.parse(m[1]))) return new Date(Date.parse(m[1])).toISOString().slice(0, 10);
  }
  const t = doc.querySelector("time[datetime]")?.getAttribute("datetime");
  return t && !Number.isNaN(Date.parse(t)) ? new Date(Date.parse(t)).toISOString().slice(0, 10) : null;
}

export function extractHtml(html: string, baseUrl: string): Extracted {
  const doc = parseHTML(html).document;
  const meta = (k: string) => doc.querySelector(`meta[property="${k}"],meta[name="${k}"]`)?.getAttribute("content")?.trim() || null;
  const abs = (h: string | null | undefined) => {
    if (!h) return null;
    try {
      const u = new URL(h, baseUrl);
      return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
    } catch {
      return null;
    }
  };
  const links: { url: string; text: string }[] = [];
  const seen = new Set<string>();
  for (const a of Array.from(doc.querySelectorAll("a[href]")) as { getAttribute(n: string): string | null; textContent: string | null }[]) {
    const url = abs(a.getAttribute("href"));
    if (!url || seen.has(url.replace(/#.*$/, ""))) continue;
    seen.add(url.replace(/#.*$/, ""));
    links.push({ url, text: (a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200) });
    if (links.length >= 400) break;
  }
  const published = firstDate(doc);
  const canonical = abs(doc.querySelector('link[rel="canonical"]')?.getAttribute("href"));
  const lang = doc.documentElement?.getAttribute("lang") ?? null;
  const headTitle = (doc.querySelector("title")?.textContent ?? "").replace(/\s+/g, " ").trim();
  const description = meta("description") ?? meta("og:description");
  const scripts = doc.querySelectorAll("script").length;
  let title = meta("og:title") ?? headTitle;
  let text = "";
  let site = meta("og:site_name");
  try {
    const art = new Readability(doc as unknown as ConstructorParameters<typeof Readability>[0], { charThreshold: 200, keepClasses: false }).parse();
    if (art?.content) {
      const { document: d2 } = parseHTML(`<html><body>${art.content}</body></html>`);
      text = blockText(d2.body as unknown as NodeLike);
      title = art.title?.trim() || title;
      site = art.siteName?.trim() || site;
    }
  } catch {
    // Readability gives up on odd markup: fall back to the body text below
  }
  if (text.length < 200) {
    const { document: d3 } = parseHTML(html);
    const body = d3.body as unknown as NodeLike | null;
    const plain = body ? blockText(body) : "";
    if (plain.length > text.length) text = plain;
  }
  const wall = WALL.test(headTitle) || (text.length < 1500 && WALL.test(html.slice(0, 50_000)));
  const needsBrowser = !wall && text.length < 400 && (APP_SHELL.test(html) || scripts >= 5 || /enable javascript|requires javascript|javascript is (disabled|required)/i.test(html));
  return { title: title.slice(0, 300), text, published, site, lang, canonical, description, links, needsBrowser, wall };
}

/** plain text and markdown pass through; the title is the first heading or line */
export function extractText(text: string): Extracted {
  const first = /^#\s+(.+)$/m.exec(text)?.[1] ?? text.split("\n").find((l) => l.trim() !== "") ?? "";
  return { title: first.trim().slice(0, 300), text: text.trim(), published: null, site: null, lang: null, canonical: null, description: null, links: [], needsBrowser: false, wall: false };
}

export async function extractPdf(bytes: Uint8Array): Promise<Extracted> {
  const { extractText: pdfText, getDocumentProxy, getMeta } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await pdfText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  let title = "";
  let published: string | null = null;
  try {
    const m = await getMeta(pdf);
    const info = (m.info ?? {}) as Record<string, unknown>;
    title = typeof info.Title === "string" ? info.Title : "";
    const raw = typeof info.CreationDate === "string" ? /^D:(\d{4})(\d{2})(\d{2})/.exec(info.CreationDate) : null;
    if (raw) published = `${raw[1]}-${raw[2]}-${raw[3]}`;
  } catch {
    // no metadata
  }
  const body = pages.map((p) => p.replace(/[ \t]+\n/g, "\n").trim()).join("\n\n");
  return { ...extractText(body), title: (title || extractText(body).title).slice(0, 300), published };
}
