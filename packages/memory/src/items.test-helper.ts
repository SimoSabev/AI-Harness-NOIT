import type { MemoryItem } from "@mandat/contract";
import { entitiesOf } from "./text.js";

export const REPO = "22222222-2222-4222-8222-222222222222";
export const OTHER_REPO = "33333333-3333-4333-8333-333333333333";

let n = 0;
/** A memory for tests: active, user scope, entities from the text; ids count up so the order is stable. */
export function mem(text: string, o: Partial<MemoryItem> = {}): MemoryItem {
  n++;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, scope: "user", kind: "fact", text, status: "active", source: "human", basis: null,
    repo_id: null, entities: entitiesOf(text), pinned: false, uses: 0, last_used_at: null, created_at: `2026-10-${String(1 + (n % 25)).padStart(2, "0")}T10:00:00.000Z`,
    invalid_at: null, superseded_by: null, provenance: {}, ...o,
  };
}
