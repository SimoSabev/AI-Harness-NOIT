import type { ResearchDepth, ResearchGoal, ResearchReport, TraceEvent } from "@mandat/contract";

// E9d (D-398): the shapes the research page shares between the server (lib/server/research.ts) and the client components.
export interface ResearchQuestionRow {
  id: string;
  question: string;
  status: "queued" | "running" | "done" | "partial" | "failed" | "stopped";
  depth: ResearchDepth | null;
  goal: ResearchGoal | null;
  partial: string | null;
  error: string | null;
  usd: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  stop_requested: boolean;
  has_report: boolean;
}
export interface ResearchFeed {
  question: ResearchQuestionRow;
  events: TraceEvent[];
  report: ResearchReport | null;
}
export interface ResearchChannel {
  id: string;
  label: string;
  kind: "api_key" | "cli_profile" | "local";
  model: string;
  health: string;
  enabled: boolean;
}

