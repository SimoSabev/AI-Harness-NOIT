// Core types — re-exported from the contract so consumers need no second import
export type { MemoryBasis, MemoryKind } from "@mandat/contract";
export type { MemoryScope, MemorySource, MemoryStatus, MemoryItem, MemoryNote, MemoryPatch, MemorySearch, MemoryProvenance } from "@mandat/contract";

// Text utilities
export { estimateTokens, terms, normalizeKey, similarity, entitiesOf, KNOWN_TOOLS } from "./text.js";

// Policy / ingestion
export { scanMemory, initialStatus, rememberLines, memoryFromNotes, NOTES_HINT } from "./policy.js";
export type { ScanReason, ScanResult } from "./policy.js";

// Core (frozen memory)
export { renderCore, memoryBlock, coreOrder } from "./core.js";
export type { Core, MemoryBlock } from "./core.js";

// Recall (search + visibility)
export { searchMemory, visible, searchAll } from "./recall.js";
export type { Hit, RecallOptions, Why } from "./recall.js";

// Consolidation
export { conflictsWith, consolidationPlan } from "./consolidate.js";
export type { ConsolidationPlan } from "./consolidate.js";

// Graph + temporal
export { memoryGraph } from "./graph.js";
export { memoryAsOf, staleAgainstRepo } from "./temporal.js";
export type { RepoFacts, StaleMemory, TimedEvent } from "./temporal.js";
export type { GraphEdge, GraphNode, MemoryGraph, NodeType } from "./graph.js";

// Metrics
export { memoryTokens, usageSummary } from "./metrics.js";
export type { UsageSummary } from "./metrics.js";

// Store (persistence)
export { addMemory, applyConsolidation, deleteMemory, loadMemory, markUsed, memoryHistory, patchMemory, recordUsage, usageRows } from "./store.js";
export type { Actor, AddResult, MemoryEvent, MemorySql, PatchResult } from "./store.js";
