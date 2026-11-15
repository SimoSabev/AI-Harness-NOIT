/** D-523: what the task card shows of the owner's twin (built by lib/server/twin; shared with the client card). */
export interface TwinView {
  class_key: string; predicted: "approved" | "rejected" | "abstain"; p: number; n: number;
  scored: number; correct: number; offer: boolean; rule: "active" | "off" | null; by_twin: boolean;
}
