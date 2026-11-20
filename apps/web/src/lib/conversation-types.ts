import type { Key } from "../i18n/t";
import type { GateRow } from "./job-strategy";
import type { AxisName, ChatTurn, ConversationStatus, JobStatus, OracleProblem, OracleStatus, SessionPhase, TaskProfileId, VerdictResult } from "@mandat/contract";

// D-531: the shapes the conversation shares between the server (lib/server/conversation.ts) and the task box.
export interface ConversationRow {
  id: string;
  agent: string;
  model: string | null;
  phase: SessionPhase;
  status: ConversationStatus;
  usd: number;
  budget_usd: number;
  error: string | null;
  task_id: string | null;
  /** D-533: the derived profile, the axes still unknown, the proposed spec's hash and the approved one */
  profile: TaskProfileId | null;
  unknown_axes: AxisName[] | null;
  spec_hash: string | null;
  spec_ready: boolean;
  approved_spec_hash: string | null;
  /** D-557: a task conversation, or the interview of the whole project */
  purpose: "task" | "project";
  /** D-557: whether the project brief of this interview is approved on the repo */
  project_approved: boolean;
}
/** D-534: the latest oracle of the approved spec (counts and criterion ids only; never a test's name or content) */
export interface OracleView {
  id: string;
  status: OracleStatus;
  spec_hash: string;
  oracle_hash: string | null;
  problems: OracleProblem[];
  red_on_base: { criterion_id: string; red: boolean }[];
  tests: number;
}
/** D-535: the job of the conversation (plan, unit statuses and verdicts, a parked question, the seal; never a test) */
export interface JobUnitView {
  id: string; title: string; criteria: string[]; status: string; result: string | null; failing: string[]; task_id: string | null;
  /** D-558: its wave (units of one wave run at once), whether it is in the pilot, and its own copy: the task, attempt and state */
  wave: number; pilot: boolean; copy: { task: string; attempt: number; state: string } | null;
}
/** D-558: how the job was planned and who does what (fixed sentences chosen from the axes; never a model's text) */
export interface JobStrategyView {
  profile: TaskProfileId | null;
  mode: "single" | "waves";
  waves: number;
  pilot: { units: number; state: string } | null;
  roles: { role: "planner" | "writer" | "advisor"; agent: string; model: string | null }[];
  reasons: Key[];
}
export interface JobView {
  id: string;
  status: JobStatus;
  question: string | null;
  units: JobUnitView[];
  current: string | null;
  final_task_id: string | null;
  seal: { hash: string; verdict: VerdictResult; result_ref: string; checked: string[]; unchecked: string[] } | null;
  merged_sha: string | null;
  strategy: JobStrategyView;
  /** D-558: the gates of the final check and their status (pending until it ran) */
  gates: GateRow[];
}
export interface ConversationFeed {
  conversation: ConversationRow;
  turns: ChatTurn[];
  /** D-534: whether the approved spec needs an oracle (the profile's plan has hidden tests), and the latest one */
  oracle_required?: boolean;
  oracle?: OracleView | null;
  job?: JobView | null;
}
/** the worker is answering: the stream stays open */
export const isAnswering = (s: ConversationStatus): boolean => s === "queued" || s === "running";
/** the stream stays open while the worker answers or the oracle is being built */
export const isFollowing = (f: ConversationFeed): boolean =>
  isAnswering(f.conversation.status) || f.oracle?.status === "building" || (f.job !== undefined && f.job !== null && ["planning", "running", "converging", "approved"].includes(f.job.status));
