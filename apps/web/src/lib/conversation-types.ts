import type { ChatTurn, ConversationStatus, SessionPhase } from "@mandat/contract";

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
}
export interface ConversationFeed {
  conversation: ConversationRow;
  turns: ChatTurn[];
}
/** the worker is answering: the stream stays open */
export const isAnswering = (s: ConversationStatus): boolean => s === "queued" || s === "running";
