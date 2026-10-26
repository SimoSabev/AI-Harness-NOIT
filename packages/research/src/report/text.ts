// E9г (D-408): the words of the report in Bulgarian and English. "auto" follows the question (Cyrillic → bg).

export type Lang = "bg" | "en";
export function langOf(language: "auto" | "bg" | "en", question: string): Lang {
  if (language !== "auto") return language;
  return /[Ѐ-ӿ]/.test(question) ? "bg" : "en";
}
const T = {
  bg: {
    title: "Ресърч", asOf: "Към", depth: { quick: "бърз", standard: "стандартен", deep: "задълбочен" }, goal: { economy: "икономичен", balanced: "балансиран", quality: "качество" },
    status: { done: "завършен", partial: "непълен", failed: "неуспешен" }, partial: { budget: "бюджетът свърши", timeout: "времето изтече", providers_down: "търсачките не отговориха", models_down: "моделите не отговориха", stopped: "спрян" },
    answer: "Отговор", claims: "Твърдения и проверка", claim: "Твърдение", verdict: "Присъда", sources: "Източници", source: "Източник", quotes: "Цитати",
    unresolved: "Непроверено и отворени въпроси", process: "Как беше направен", map: "Карта на процеса", timeline: "Времева линия", models: "Модели по роли", ladder: "Четене на страници по ниво",
    trace: "Пълен дневник", stats: { queries: "заявки", results: "резултата", pages_fetched: "опита за четене", pages_read: "прочетени страници", domains: "домейна", quotes: "цитата", claims: "твърдения", usd: "разход", ms: "време", tokens: "токена" },
    v: { confirmed: "потвърдено", single: "един източник", conflict: "противоречие", unchecked: "непроверено", quote_missing: "няма цитат" },
    role: { planner: "планиране", searcher: "заявки", triage: "подбор", reader: "четене", analyst: "анализ на лента", verifier: "проверка", writer: "писане" },
    col: { n: "№", title: "Заглавие", domain: "Домейн", published: "Публикуван", tier: "Ниво", fetched: "Прочетен", hash: "Хеш", role: "Роля", channel: "Канал", model: "Модел", calls: "Повиквания", tokens: "Токени", usd: "$", time: "Време" },
    lane: "Лента", plan: "Стратегия", noClaims: "Няма твърдения с цитат.", rejected: "отхвърлени цитата (не са дословно в страницата)", stop: "Спря, защото", generated: "Създадено от Мандат · всеки цитат е точен подниз на прочетения текст с този хеш",
    tiers: { http: "HTTP", browser: "браузър", archive: "архив", provider: "доставчик" }, json: "Данните (JSON)",
    noSource: "Без източник", conflictOf: "Противоречие", nothingBacked: "Нищо не беше потвърдено с цитат.",
  },
  en: {
    title: "Research", asOf: "As of", depth: { quick: "quick", standard: "standard", deep: "deep" }, goal: { economy: "economy", balanced: "balanced", quality: "quality" },
    status: { done: "done", partial: "partial", failed: "failed" }, partial: { budget: "budget ran out", timeout: "time ran out", providers_down: "search providers down", models_down: "models down", stopped: "stopped" },
    answer: "Answer", claims: "Claims and checks", claim: "Claim", verdict: "Verdict", sources: "Sources", source: "Source", quotes: "Quotes",
    unresolved: "Unverified and open questions", process: "How it was done", map: "Process map", timeline: "Timeline", models: "Models by role", ladder: "Page reads by tier",
    trace: "Full log", stats: { queries: "queries", results: "results", pages_fetched: "fetch attempts", pages_read: "pages read", domains: "domains", quotes: "quotes", claims: "claims", usd: "cost", ms: "time", tokens: "tokens" },
    v: { confirmed: "confirmed", single: "single source", conflict: "conflict", unchecked: "unchecked", quote_missing: "no quote" },
    role: { planner: "planning", searcher: "queries", triage: "triage", reader: "reading", analyst: "lane analysis", verifier: "verification", writer: "writing" },
    col: { n: "#", title: "Title", domain: "Domain", published: "Published", tier: "Tier", fetched: "Read at", hash: "Hash", role: "Role", channel: "Channel", model: "Model", calls: "Calls", tokens: "Tokens", usd: "$", time: "Time" },
    lane: "Lane", plan: "Strategy", noClaims: "No claim could be backed by a quote.", rejected: "quotes rejected (not verbatim on the page)", stop: "Stopped because", generated: "Made by Mandat · every quote is an exact substring of the read text with this hash",
    tiers: { http: "HTTP", browser: "browser", archive: "archive", provider: "provider" }, json: "The data (JSON)",
    noSource: "No source", conflictOf: "Conflict", nothingBacked: "Nothing could be backed by a quote.",
  },
} as const;
export type Words = (typeof T)["en"];
export const wordsOf = (l: Lang): Words => T[l] as unknown as Words;
export function duration(ms: number): string {
  if (ms < 10_000) return `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)} s`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}
export const usd = (x: number) => (x === 0 ? "$0" : x < 0.01 ? `$${x.toFixed(4)}` : `$${x.toFixed(2)}`);
