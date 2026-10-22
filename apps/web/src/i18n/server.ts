import "server-only";
import { cookies, headers } from "next/headers";
import { parseLang, translator } from "./t";
import type { Lang, T } from "./t";

// E7f: the language of this request — the cookie `lang` (Settings), else Accept-Language, else English.
export async function getLang(): Promise<Lang> {
  const [jar, h] = await Promise.all([cookies(), headers()]);
  return parseLang(jar.get("lang")?.value, h.get("accept-language"));
}

export async function getT(): Promise<T> {
  return translator(await getLang());
}
