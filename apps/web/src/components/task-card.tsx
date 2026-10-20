import Link from "next/link";
import type { TaskRow } from "../lib/server/queries";
import { ladderHint } from "../lib/ladder-hint";
import { ACTION_LABEL, LAYER_LABEL, failureLayer, primaryAction, reasonText, testsOf, verdictView } from "../lib/verdict-view";
import { TaskActions } from "./task-actions";
import { Verdict } from "./verdict";

const STATE_TEXT: Record<string, string> = {
  HELD: "чака решение", GATED: "на вратата", BLOCKED: "блокирано", RUNNING: "работи", CREATED: "нова", CONTRACTED: "договор", CLOSED: "затворено",
  DELIVERED: "доставено", OUTCOME: "резултат", PROVISIONING: "подготовка", EXPORTING: "износ", RETRY: "повторение", VERIFY_1: "проверка", VERIFY_2: "проверка 2", VERDICT: "присъда", REBASING: "rebase", PUSHED: "изпратено",
};

export function TaskCard({ t, canAct, compact = false, heading = "h2" }: { t: TaskRow; canAct: boolean; compact?: boolean; heading?: "h2" | "h3" }) {
  const v = verdictView(t.last_result);
  const layer = t.last_result === "FAILED" ? failureLayer(t.reasons) : null;
  const action = primaryAction({ state: t.state, result: t.last_result, approval_needed: t.approval_needed, pr_number: t.pr_number });
  const H = heading;
  return (
    <article className={`card ${v.tone}`} aria-labelledby={`h-${t.id}`}>
      <Verdict result={t.last_result} />
      <H id={`h-${t.id}`}>
        <Link href={`/tasks/${t.id}`}>{t.text}</Link>
      </H>
      {!compact && t.reasons.length > 0 && (
        <ul className="reasons">
          {t.reasons.map((r) => (
            <li key={r}>{reasonText(r)}</li>
          ))}
        </ul>
      )}
      {layer && <p>Слой: {LAYER_LABEL[layer]}</p>}
      {!compact && <p className="mono">{testsOf(t)}{t.ledger_seq !== null ? <> · <span aria-label={`запис в дневника ${t.ledger_seq}`}>⌁ seq {t.ledger_seq}</span></> : null}</p>}
      {t.ladder_level !== null && (
        <p className={`level level-${t.ladder_level}`}>{ladderHint({ level: t.ladder_level, s_up: t.ladder_s_up ?? 0, pinned: t.ladder_pinned ?? false })}</p>
      )}
      <p className="muted">
        {t.agent} · {t.type} · {STATE_TEXT[t.state] ?? t.state}
        {t.wait_reason ? ` (${t.wait_reason})` : ""} · ${t.usd.toFixed(2)} · {t.minutes.toFixed(1)} мин
      </p>
      {!compact && (
        <TaskActions
          taskId={t.id}
          primary={action}
          primaryLabel={ACTION_LABEL[action]}
          canAct={canAct}
          changesetId={t.changeset_id}
          headSha={t.head_sha}
          twoFactor={t.requires_second_factor}
          prNumber={t.pr_number}
          verdictId={t.last_result === "FAILED" ? t.verdict_id : null}
          retryable={t.state === "BLOCKED" || (t.state === "HELD" && t.last_result === "UNKNOWN")}
          stoppable={!["DELIVERED", "OUTCOME", "CLOSED", "BLOCKED"].includes(t.state)}
        />
      )}
    </article>
  );
}
