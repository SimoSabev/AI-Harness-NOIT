import type { AxisName, ChatTurn, ConversationStatus, OracleProblem, OracleStatus, SessionPhase, TaskProfileId } from "@mandat/contract";

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
export interface ConversationFeed {
  conversation: ConversationRow;
  turns: ChatTurn[];
  /** D-534: whether the approved spec needs an oracle (the profile's plan has hidden tests), and the latest one */
  oracle_required?: boolean;
  oracle?: OracleView | null;
}
/** the worker is answering: the stream stays open */
export const isAnswering = (s: ConversationStatus): boolean => s === "queued" || s === "running";
/** the stream stays open while the worker answers or the oracle is being built */
export const isFollowing = (f: ConversationFeed): boolean => isAnswering(f.conversation.status) || f.oracle?.status === "building";
