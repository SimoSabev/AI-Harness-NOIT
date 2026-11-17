import type { AxisName, ChatTurn, ConversationStatus, SessionPhase, TaskProfileId } from "@mandat/contract";

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
export interface ConversationFeed {
  conversation: ConversationRow;
  turns: ChatTurn[];
}
/** the worker is answering: the stream stays open */
export const isAnswering = (s: ConversationStatus): boolean => s === "queued" || s === "running";
