import type { MemoryItem } from "@mandat/contract";
import { consolidationPlan } from "./consolidate.js";
import { searchMemory } from "./recall.js";
import { entitiesOf } from "./text.js";

// D-401: a small golden set in the spirit of LongMemEval (direct recall, other word forms, entities, updated facts,
// abstention). It is the gate for vectors: recall stays words + entities while this passes.

const REPO = "22222222-2222-4222-8222-222222222222";
type Seed = [key: string, text: string, scope: "user" | "project", kind: MemoryItem["kind"], created: string];
const SEEDS: readonly Seed[] = [
  ["m1", "Отговаряй на български, кратко и по същество", "user", "preference", "2026-10-10"],
  ["m2", "Ползвам npm за всичко", "user", "preference", "2026-09-01"],
  ["m3", "Вече ползвам pnpm", "user", "preference", "2026-10-02"],
  ["m4", "Docker върви на Colima с 4 CPU и 8 GB", "user", "fact", "2026-10-03"],
  ["m5", "Компютърът ми е MacBook с Apple M3", "user", "fact", "2026-10-03"],
  ["m6", "Всички проверки: pnpm check (build, lint, типове, тестове)", "project", "command", "2026-10-04"],
  ["m7", "Docker тестовете се пускат с pnpm test:docker", "project", "command", "2026-10-04"],
  ["m8", "Комитите са на английски във формат <пакет>: <какво>", "project", "convention", "2026-10-05"],
  ["m9", "Остарял dist от turbo кеша дава странни грешки; пусни npx turbo run build --force", "project", "pitfall", "2026-10-05"],
  ["m10", "Демо магазинът е в fixtures/shop", "project", "fact", "2026-10-06"],
  ["m11", "Решенията се записват в docs/decisions.md със „защо“", "project", "convention", "2026-10-06"],
  ["m12", "Docker Hub връща 429 — ползвай mirror.gcr.io", "project", "pitfall", "2026-10-07"],
  ["m13", "Уеб интерфейсът е Next.js в apps/web", "project", "fact", "2026-10-07"],
  ["m14", "Десктопът е Electron в apps/desktop", "project", "fact", "2026-10-08"],
  ["m15", "Предпочитам малки комити, по един логически ход", "user", "preference", "2026-10-08"],
  ["m16", "Ключовете на доставчиците са само в llm-proxy, никога в пясъчника", "project", "fact", "2026-10-09"],
  ["m17", "Тестовете пиша с jest", "user", "preference", "2026-08-01"],
  ["m18", "Тестовете пиша с vitest", "user", "preference", "2026-10-09"],
  ["m19", "Отговаряй на английски", "user", "preference", "2026-08-02"],
  ["m20", "Нощната смяна паркира задачите с въпрос до сутринта", "project", "fact", "2026-10-10"],
];

export type CaseKind = "direct" | "morphology" | "entity" | "update" | "abstain";
export interface GoldenCase { q: string; kind: CaseKind; expect: string | null; gone?: string }
const CASES: readonly GoldenCase[] = [
  { q: "pnpm check", kind: "direct", expect: "m6" },
  { q: "Colima CPU", kind: "direct", expect: "m4" },
  { q: "turbo кеша", kind: "direct", expect: "m9" },
  { q: "формат на комитите", kind: "direct", expect: "m8" },
  { q: "къде е демо магазинът", kind: "direct", expect: "m10" },
  { q: "429 от Docker Hub", kind: "direct", expect: "m12" },
  { q: "нощната смяна", kind: "direct", expect: "m20" },
  { q: "Docker тест", kind: "morphology", expect: "m7" },
  { q: "магазина", kind: "morphology", expect: "m10" },
  { q: "комит", kind: "morphology", expect: "m8" },
  { q: "отговарям", kind: "morphology", expect: "m1" },
  { q: "ключът на доставчика", kind: "morphology", expect: "m16" },
  { q: "electron", kind: "entity", expect: "m14" },
  { q: "apps/web", kind: "entity", expect: "m13" },
  { q: "fixtures/shop", kind: "entity", expect: "m10" },
  { q: "docs/decisions.md", kind: "entity", expect: "m11" },
  { q: "jest или vitest", kind: "update", expect: "m18", gone: "m17" },
  { q: "npm или pnpm", kind: "update", expect: "m3", gone: "m2" },
  { q: "отговаряй на какъв език", kind: "update", expect: "m1", gone: "m19" },
  { q: "рецепта за баница", kind: "abstain", expect: null },
  { q: "what is the weather in Sofia", kind: "abstain", expect: null },
  { q: "кой спечели мача снощи", kind: "abstain", expect: null },
  { q: "любимият ми филм", kind: "abstain", expect: null },
];

function items(): { items: MemoryItem[]; id: (k: string) => string } {
  const ids = new Map(SEEDS.map(([k], i) => [k, `00000000-0000-4000-9000-${String(i + 1).padStart(12, "0")}`]));
  const id = (k: string) => ids.get(k) ?? k;
  const list: MemoryItem[] = SEEDS.map(([k, text, scope, kind, created]) => ({
    id: id(k), scope, kind, text, status: "active", source: "human", basis: null, repo_id: scope === "project" ? REPO : null, entities: entitiesOf(text),
    pinned: false, uses: 0, last_used_at: null, created_at: `${created}T10:00:00.000Z`, invalid_at: null, superseded_by: null, provenance: {},
  }));
  return { items: list, id };
}

export const GOLDEN = Object.freeze({ seeds: SEEDS, cases: CASES });

export interface EvalResult { recallAt5: number; updates: number; abstain: number; failures: string[] }

/** Runs the golden set: consolidation first (as Mandat does after writes), then a search per question. */
export function evaluate(): EvalResult {
  const { items: list, id } = items();
  const plan = consolidationPlan(list, new Date("2026-10-26T00:00:00Z"));
  const consolidated = list.map((m) => {
    const s = plan.supersede.find((x) => x.old === m.id);
    const d = plan.duplicates.find((x) => x.drop === m.id);
    return s ? { ...m, status: "invalid" as const, superseded_by: s.by } : d ? { ...m, status: "archived" as const, superseded_by: d.keep } : m;
  });
  const failures: string[] = [];
  let found = 0, recallN = 0, upd = 0, updN = 0, abst = 0, abstN = 0;
  for (const c of CASES) {
    const hits = searchMemory(consolidated, c.q, { repoId: REPO, limit: 5 }).map((h) => h.item.id);
    if (c.kind === "abstain") {
      abstN++;
      if (hits.length === 0) abst++;
      else failures.push(`abstain: ${c.q}`);
      continue;
    }
    recallN++;
    const ok = c.expect !== null && hits.includes(id(c.expect));
    if (ok) found++;
    else failures.push(`${c.kind}: ${c.q}`);
    if (c.kind === "update") {
      updN++;
      if (hits[0] === id(c.expect ?? "") && !hits.includes(id(c.gone ?? ""))) upd++;
      else failures.push(`update order: ${c.q}`);
    }
  }
  return { recallAt5: found / recallN, updates: updN === 0 ? 1 : upd / updN, abstain: abstN === 0 ? 1 : abst / abstN, failures };
}
