# `@mandat/memory` — D-400

Mandat's memory system: trust-level writes, frozen core, hybrid recall (BM25 + entities), consolidation, graph, and evaluation.

## Quick start

```ts
import {
  // ingestion
  addMemory, scanMemory, initialStatus, rememberLines, memoryFromNotes,

  // search
  searchMemory, visible, searchAll,

  // core
  renderCore, memoryBlock, coreOrder,

  // consolidation
  conflictsWith, consolidationPlan, applyConsolidation,

  // store
  loadMemory, patchMemory, deleteMemory, markUsed, memoryHistory, recordUsage, usageRows,

  // analysis
  memoryGraph, memoryAsOf, staleAgainstRepo,
  memoryTokens, usageSummary,

  // text
  estimateTokens, terms, entitiesOf,

  // types
  type Hit, type Core, type ConsolidationPlan,
  type MemoryBasis, type MemoryKind, type MemoryScope, type MemoryStatus,
} from "@mandat/memory";
```

Eval harness (opt-in):

```ts
import { GOLDEN, evaluate } from "@mandat/memory/eval";
```

## Data flow

```
human says / agent writes
  → policy.scanMemory (invisible / secret / injection / rule checks)
  → store.addMemory → SQLite
  → consolidationPlan (duplicates, supersede, stale suggestions)
  → applyConsolidation (merge / invalidate)
  → searchMemory (BM25 + entities + recency RRF)
  → memoryBlock (core + recall merged text → LLM prompt)
```

## Module map

| Module     | Role                          | Key exports                                       |
|------------|-------------------------------|---------------------------------------------------|
| `store.ts` | Persistence (SQLite)          | `loadMemory`, `addMemory`, `patchMemory`, `deleteMemory`, `applyConsolidation` |
| `core.ts`  | Frozen memory rendering       | `renderCore`, `memoryBlock`, `coreOrder`          |
| `policy.ts`| Ingestion rules               | `scanMemory`, `initialStatus`, `rememberLines`, `memoryFromNotes`, `NOTES_HINT` |
| `recall.ts`| Hybrid search (BM25+entities) | `searchMemory`, `visible`, `searchAll` (user + session only) |
| `text.ts`  | Text utilities                | `estimateTokens`, `terms`, `entitiesOf`, `normalizeKey`, `similarity` |
| `consolidate.ts` | Memory housekeeping   | `conflictsWith`, `consolidationPlan`              |
| `graph.ts` | Radial dependency graph       | `memoryGraph`                                     |
| `temporal.ts` | Time-aware queries        | `memoryAsOf`, `staleAgainstRepo`                  |
| `metrics.ts` | Token / usage counting     | `memoryTokens`, `usageSummary`                    |
| `eval.ts`  | Golden set (internal)         | `GOLDEN` (23 seeds), `evaluate` (recall@5, abstention) |

## Consumer map

| Consumer                                       | Imports from `@mandat/memory`                          |
|------------------------------------------------|--------------------------------------------------------|
| `apps/worker/src/online/memory.ts`            | `NOTES_HINT`, `addMemory`, `applyConsolidation`, `consolidationPlan`, `loadMemory`, `memoryBlock`, `memoryFromNotes`, `recordUsage`, `rememberLines`, `renderCore`, `searchMemory` |
| `apps/worker/src/online/conversation.ts`      | `addMemory`, `loadMemory`, `rememberLines`, `searchMemory` |
| `apps/web/src/lib/server/memory.ts`           | `addMemory`, `applyConsolidation`, `consolidationPlan`, `deleteMemory`, `loadMemory`, `memoryAsOf`, `memoryHistory`, `memoryTokens`, `patchMemory`, `renderCore`, `staleAgainstRepo`, `usageRows`, `usageSummary` |
| `apps/web/src/lib/memory-view.ts`             | `searchMemory`                                         |
| `packages/memory/src/mcp.ts`                  | `memoryBlock`, `renderCore`, `searchMemory`, `addMemory`, `loadMemory`, `markUsed`, `entitiesOf` |

## Contract types

Re-exported from `@mandat/contract` so consumers need no second import:

```ts
type MemoryBasis = "user_said" | "observed";
type MemoryKind = "preference" | "convention" | "command" | "pitfall" | "fact" | "note" | "episode";
type MemoryScope = "user" | "project" | "session";
type MemoryStatus = "active" | "pending" | "rejected" | "invalid" | "archived";
```

## Budgets

| Budget      | Tokens |
|-------------|--------|
| user core   | 500    |
| project core| 800    |
| recall slice| 1500   |
| max block   | 12000  |
