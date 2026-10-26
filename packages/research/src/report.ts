// E9г (D-408): the pure report side — no network, no Node APIs — for the web page and the live panel in the browser.
export { esc, mdToHtml, reportHtml } from "./report/html.js";
export { reportMarkdown } from "./report/markdown.js";
export { processView } from "./report/process.js";
export type { LaneSummary, ProcessView, RoleUsage, TimelineBar } from "./report/process.js";
export { duration, langOf, usd as usdText, wordsOf } from "./report/text.js";
export type { Lang, Words } from "./report/text.js";
