// The verification pieces moved to @mandat/verify (Apache-2.0, D-205); re-exported for existing callers.
export { acquireRunLock, buildVerifyTree, gatePaths, hostConfig, infraUserFor, mergePackageJson, readGateLog, runSandbox, runTestProcedure, safeReadVolume, startRunGate } from "@mandat/verify";
export type { HostConfig, TestProcedureInput, TestProcedureResult } from "@mandat/verify";
export { doctorDeep } from "./doctor-deep.js";
export type { DoctorDeepResult } from "./doctor-deep.js";
export { DEMO_SHOP_FILES, FIXTURES, SHOP_FILES, buildFixture, buildShopFixture } from "./fixtures.js";
export type { FixtureName } from "./fixtures.js";
export { runTask } from "./run.js";
export type { RunHooks, RunInternals, RunTaskInput, RunTaskOutput } from "./run.js";
export { LOCAL_DB_URL, dbUrl, inTransaction, openDb } from "./online/db.js";
export type { Db } from "./online/db.js";
export { MemoryOutbox, drainOutbox } from "./online/outbox.js";
export type { OutboxKind, OutboxRow, OutboxStore } from "./online/outbox.js";
export { PgOutbox, enqueueOutbox } from "./online/pg-outbox.js";
export { DEMO_ORG_ID, DEMO_OWNER_ID, DEMO_REPO_ID, seedMinimal } from "./online/seed.js";
