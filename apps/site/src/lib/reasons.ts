import { explain } from "@mandat/contract";
import type { Lang } from "../i18n/t";

const unescapeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/**
 * E9g B step 7 (D-378): a D-reason → the sentence the task card shows (the same as apps/web/src/lib/verdict-view.ts
 * reasonText): the contract's explain text, the verdict line dropped, the <untrusted> frame shown as «text».
 */
export function reasonText(reason: string, lang: Lang = "en"): string {
  const s = explain({ result: "-", reasons: [reason], lang }).split("\n").slice(1).join(" ");
  return s.replace(/<untrusted[^>]*>([\s\S]*?)<\/untrusted>/g, (_m, id: string) => `«${unescapeXml(id)}»`);
}
