import type { Key } from "../i18n/t";

// E9g B step 7 (D-378): the pages of /docs as data — each page is a list of blocks that one renderer turns into HTML
// (views/doc-page.tsx). Text is always a catalog key (en + bg); commands are code and stay as they are in both languages.
export const DOC_SLUGS = ["getting-started", "how-it-works", "verdicts", "desktop", "night-shift", "security", "keys", "faq"] as const;
export type DocSlug = (typeof DOC_SLUGS)[number];

export type DiagramName = "flow" | "permissions" | "night" | "keys";
export type ShotName = "inbox" | "task-verified" | "task-failed" | "night" | "board";
export type Cell = Key | { code: string } | { verdict: "VERIFIED" | "UNKNOWN" | "FAILED" } | { reason: string };

export type Block =
  | { h2: Key; id: string }
  | { p: Key }
  | { ul: readonly Key[] }
  | { code: string }
  | { requirements: true }
  | { table: { caption: Key; head: readonly Key[]; rows: readonly (readonly Cell[])[] } }
  | { diagram: DiagramName }
  | { shot: ShotName; alt: Key; caption: Key }
  | { faq: readonly (readonly [Key, Key])[] };

export interface DocPageData {
  title: Key;
  lead: Key;
  blocks: readonly Block[];
}

const h2 = (key: Key, id: string): Block => ({ h2: key, id });

/** The detectors D1–D12: what each checks and one real example — the contract's explain sentence where there is one. */
const DETECTORS: readonly (readonly Cell[])[] = [
  [{ code: "D1" }, "docs.verdicts.D1", { reason: "D1:regression:tests/cart.spec.ts > cart > adds VAT to the total" }],
  [{ code: "D2" }, "docs.verdicts.D2", { reason: "D2:missing_test:tests/cart.spec.ts > cart > applies 10% over 50" }],
  [{ code: "D3" }, "docs.verdicts.D3", { reason: "D3:protected:.github/workflows/ci.yml" }],
  [{ code: "D4" }, "docs.verdicts.D4", { reason: "D4:out_of_contract:src/payments/stripe.ts" }],
  [{ code: "D5" }, "docs.verdicts.D5", { reason: "D5:hidden_fail:h3f9a2c1b" }],
  [{ code: "D6" }, "docs.verdicts.D6", "docs.verdicts.D6.ex"],
  [{ code: "D7" }, "docs.verdicts.D7", "docs.verdicts.D7.ex"],
  [{ code: "D8" }, "docs.verdicts.D8", { reason: "D8:lint_fail:-" }],
  [{ code: "D9" }, "docs.verdicts.D9", "docs.verdicts.D9.ex"],
  [{ code: "D10" }, "docs.verdicts.D10", "docs.verdicts.D10.ex"],
  [{ code: "D11" }, "docs.verdicts.D11", { reason: "D11:survived:src/cart.ts:42" }],
  [{ code: "D12" }, "docs.verdicts.D12", { reason: "D12:visual_diff:/cart" }],
];

const OTHER_CHECKS: readonly (readonly Cell[])[] = [
  [{ code: "EXPORT" }, "docs.verdicts.EXPORT", { reason: "EXPORT:empty_change:-" }],
  [{ code: "CANARY" }, "docs.verdicts.CANARY", "docs.verdicts.CANARY.ex"],
  [{ code: "INTEGRITY" }, "docs.verdicts.INTEGRITY", "docs.verdicts.INTEGRITY.ex"],
  [{ code: "MUST_PASS" }, "docs.verdicts.MUST_PASS", "docs.verdicts.MUST_PASS.ex"],
  [{ code: "POLICY" }, "docs.verdicts.POLICY", { reason: "POLICY:missing:-" }],
  [{ code: "REVIEW" }, "docs.verdicts.REVIEW", { reason: "REVIEW:high:src/cart.ts" }],
];

export const DOCS: Record<DocSlug, DocPageData> = {
  "getting-started": {
    title: "docs.start.title",
    lead: "docs.start.lead",
    blocks: [
      h2("docs.start.need.h", "need"),
      { requirements: true },
      h2("docs.start.install.h", "install"),
      { p: "docs.start.install.p1" },
      { p: "docs.start.install.p2" },
      h2("docs.start.first.h", "first-start"),
      { p: "docs.start.first.p1" },
      { p: "docs.start.first.p2" },
      { p: "docs.start.first.p3" },
      { shot: "inbox", alt: "docs.start.shot.inbox", caption: "docs.start.shot.inboxCaption" },
      h2("docs.start.project.h", "project"),
      { p: "docs.start.project.p1" },
      { p: "docs.start.project.p2" },
      { p: "docs.start.project.p3" },
      { code: "pnpm mandat init --repo <folder>" },
      h2("docs.start.account.h", "account"),
      { p: "docs.start.account.p1" },
      { p: "docs.start.account.p2" },
      h2("docs.start.task.h", "task"),
      { p: "docs.start.task.p1" },
      { p: "docs.start.task.p2" },
      { shot: "task-verified", alt: "docs.start.shot.task", caption: "docs.start.shot.taskCaption" },
      h2("docs.start.cli.h", "cli"),
      { p: "docs.start.cli.p1" },
      { code: "pnpm install --frozen-lockfile\npnpm local" },
    ],
  },
  "how-it-works": {
    title: "docs.how.title",
    lead: "docs.how.lead",
    blocks: [
      { diagram: "flow" },
      h2("docs.how.contract.h", "contract"),
      { p: "docs.how.contract.p" },
      h2("docs.how.sandbox.h", "sandbox"),
      { p: "docs.how.sandbox.p1" },
      { p: "docs.how.sandbox.p2" },
      h2("docs.how.export.h", "export"),
      { p: "docs.how.export.p" },
      h2("docs.how.verify.h", "verify"),
      { p: "docs.how.verify.p" },
      h2("docs.how.verdict.h", "verdict"),
      { p: "docs.how.verdict.p1" },
      { p: "docs.how.verdict.p2" },
      { shot: "board", alt: "docs.how.shot.board", caption: "docs.how.shot.boardCaption" },
      h2("docs.how.ledger.h", "ledger"),
      { p: "docs.how.ledger.p" },
      { code: "pnpm mandat verify-log" },
    ],
  },
  verdicts: {
    title: "docs.verdicts.title",
    lead: "docs.verdicts.lead",
    blocks: [
      { p: "docs.verdicts.rule" },
      {
        table: {
          caption: "docs.verdicts.table",
          head: ["docs.verdicts.col.verdict", "docs.verdicts.col.means", "docs.verdicts.col.do"],
          rows: [
            [{ verdict: "VERIFIED" }, "docs.verdicts.verified.means", "docs.verdicts.verified.do"],
            [{ verdict: "UNKNOWN" }, "docs.verdicts.unknown.means", "docs.verdicts.unknown.do"],
            [{ verdict: "FAILED" }, "docs.verdicts.failed.means", "docs.verdicts.failed.do"],
          ],
        },
      },
      { shot: "task-failed", alt: "docs.verdicts.shot.failed", caption: "docs.verdicts.shot.failedCaption" },
      h2("docs.verdicts.detectors.h", "detectors"),
      { p: "docs.verdicts.detectors.p" },
      { table: { caption: "docs.verdicts.det.table", head: ["docs.verdicts.col.id", "docs.verdicts.col.what", "docs.verdicts.col.example"], rows: DETECTORS } },
      h2("docs.verdicts.other.h", "other"),
      { table: { caption: "docs.verdicts.other.table", head: ["docs.verdicts.col.id", "docs.verdicts.col.what", "docs.verdicts.col.example"], rows: OTHER_CHECKS } },
      h2("docs.verdicts.limits.h", "limits"),
      { ul: ["docs.verdicts.limits.1", "docs.verdicts.limits.2", "docs.verdicts.limits.3"] },
    ],
  },
  desktop: {
    title: "docs.desktop.title",
    lead: "docs.desktop.lead",
    blocks: [
      h2("docs.desktop.adds.h", "adds"),
      { ul: ["docs.desktop.adds.1", "docs.desktop.adds.2", "docs.desktop.adds.3", "docs.desktop.adds.4"] },
      h2("docs.desktop.grants.h", "grants"),
      { p: "docs.desktop.grants.p1" },
      { diagram: "permissions" },
      {
        table: {
          caption: "docs.desktop.scopes",
          head: ["docs.desktop.col.right", "docs.desktop.col.allows"],
          rows: [
            [{ code: "read" }, "docs.desktop.scope.read"],
            [{ code: "apply" }, "docs.desktop.scope.apply"],
            [{ code: "open_editor" }, "docs.desktop.scope.open_editor"],
            [{ code: "terminal" }, "docs.desktop.scope.terminal"],
          ],
        },
      },
      { p: "docs.desktop.grants.p2" },
      h2("docs.desktop.refuses.h", "refuses"),
      { ul: ["docs.desktop.refuses.1", "docs.desktop.refuses.2", "docs.desktop.refuses.3", "docs.desktop.refuses.4", "docs.desktop.refuses.5"] },
      h2("docs.desktop.agent.h", "agent"),
      { p: "docs.desktop.agent.p1" },
      { p: "docs.desktop.agent.p2" },
      h2("docs.desktop.window.h", "window"),
      { p: "docs.desktop.window.p" },
      h2("docs.desktop.keys.h", "keychain"),
      { p: "docs.desktop.keys.p" },
    ],
  },
  "night-shift": {
    title: "docs.night.title",
    lead: "docs.night.lead",
    blocks: [
      { diagram: "night" },
      h2("docs.night.plan.h", "plan"),
      { p: "docs.night.plan.p" },
      h2("docs.night.rules.h", "rules"),
      { ul: ["docs.night.rules.1", "docs.night.rules.2", "docs.night.rules.3", "docs.night.rules.4", "docs.night.rules.5"] },
      h2("docs.night.fail.h", "fail"),
      { p: "docs.night.fail.p1" },
      { p: "docs.night.fail.p2" },
      { p: "docs.night.fail.p3" },
      h2("docs.night.morning.h", "morning"),
      { p: "docs.night.morning.p" },
      { shot: "night", alt: "docs.night.shot", caption: "docs.night.shotCaption" },
    ],
  },
  security: {
    title: "docs.security.title",
    lead: "docs.security.lead",
    blocks: [
      h2("docs.security.sandbox.h", "sandbox"),
      { p: "docs.security.sandbox.p" },
      h2("docs.security.proxy.h", "proxy"),
      { diagram: "keys" },
      { p: "docs.security.proxy.p1" },
      { p: "docs.security.proxy.p2" },
      h2("docs.security.text.h", "text"),
      { p: "docs.security.text.p" },
      h2("docs.security.us.h", "nothing-to-us"),
      { ul: ["docs.security.us.1", "docs.security.us.2", "docs.security.us.3", "docs.security.us.4", "docs.security.us.5"] },
      h2("docs.security.limits.h", "limits"),
      { ul: ["docs.security.limits.1", "docs.security.limits.2"] },
    ],
  },
  keys: {
    title: "docs.keys.title",
    lead: "docs.keys.lead",
    blocks: [
      h2("docs.keys.sub.h", "subscription"),
      { p: "docs.keys.sub.p1" },
      { code: "pnpm mandat login --name personal" },
      { p: "docs.keys.sub.p2" },
      { p: "docs.keys.sub.p3" },
      h2("docs.keys.api.h", "api-keys"),
      { p: "docs.keys.api.p" },
      h2("docs.keys.limits.h", "limits"),
      { p: "docs.keys.limits.p1" },
      { p: "docs.keys.limits.p2" },
      h2("docs.keys.demo.h", "demo"),
      { p: "docs.keys.demo.p" },
    ],
  },
  faq: {
    title: "docs.faq.title",
    lead: "docs.faq.lead",
    blocks: [
      {
        faq: [
          ["docs.faq.q1", "docs.faq.a1"],
          ["docs.faq.q2", "docs.faq.a2"],
          ["docs.faq.q3", "docs.faq.a3"],
          ["docs.faq.q4", "docs.faq.a4"],
          ["docs.faq.q5", "docs.faq.a5"],
          ["docs.faq.q6", "docs.faq.a6"],
          ["docs.faq.q7", "docs.faq.a7"],
          ["docs.faq.q8", "docs.faq.a8"],
          ["docs.faq.q9", "docs.faq.a9"],
          ["docs.faq.q10", "docs.faq.a10"],
        ],
      },
    ],
  },
};

/** The address of a docs page (the trailing slash of the export). */
export function docPath(slug: DocSlug): `/docs/${DocSlug}/` {
  return `/docs/${slug}/`;
}

/** The previous and next page, for the links at the bottom. */
export function docNeighbours(slug: DocSlug): { prev: DocSlug | null; next: DocSlug | null } {
  const i = DOC_SLUGS.indexOf(slug);
  return { prev: DOC_SLUGS[i - 1] ?? null, next: DOC_SLUGS[i + 1] ?? null };
}

/** The h2 sections of a page, for "On this page". */
export function docSections(slug: DocSlug): { id: string; key: Key }[] {
  return DOCS[slug].blocks.flatMap((b) => ("h2" in b ? [{ id: b.id, key: b.h2 }] : []));
}
