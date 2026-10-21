// D-292: what the person sees — one status word + one sentence per task, never the internal state names.
export type StatusKey = "queued" | "running" | "checking" | "review" | "failed" | "unknown" | "empty" | "key" | "stopped" | "approved" | "closed";
export type Tone = "gray" | "blue" | "green" | "red" | "amber";
export interface Status { key: StatusKey; label: string; tone: Tone; headline: string }

const S: Record<StatusKey, Omit<Status, "key">> = {
  queued: { label: "На опашка", tone: "gray", headline: "Задачата чака свободен worker." },
  running: { label: "Агентът работи", tone: "blue", headline: "Агентът работи в затворен пясъчник, без достъп до ключове и мрежа." },
  checking: { label: "Проверява се", tone: "blue", headline: "Мандат пуска тестовете и сравнява с оригиналния код." },
  review: { label: "Чака одобрение", tone: "green", headline: "Мандат провери промяната и тя мина. Прегледай я и реши." },
  failed: { label: "Провал", tone: "red", headline: "Мандат отхвърли промяната. Причината е отдолу." },
  unknown: { label: "Неясно", tone: "amber", headline: "Мандат не може да потвърди, че промяната работи." },
  empty: { label: "Без промяна", tone: "amber", headline: "Агентът не промени нито един файл." },
  key: { label: "Ключът е отхвърлен", tone: "red", headline: "Доставчикът отказа API ключа. Провери го в „Ключове“ и пусни задачата отново." },
  stopped: { label: "Спряна", tone: "gray", headline: "Задачата е спряна ръчно." },
  approved: { label: "Одобрена", tone: "green", headline: "Проверена от Мандат и одобрена от човек. Промяната е готова за сливане." },
  closed: { label: "Приключена", tone: "gray", headline: "Задачата е приключена." },
};

const RUNNING = new Set(["PROVISIONING", "RUNNING", "EXPORTING", "RETRY"]);
const CHECKING = new Set(["VERIFY_1", "REBASING", "PUSHED", "VERIFY_2", "VERDICT"]);

export function statusOf(t: { state: string; last_result: string | null; wait_reason: string | null; approval_needed: boolean; approved_by_human: boolean }): Status {
  const k = keyOf(t);
  return { key: k, ...S[k] };
}

function keyOf(t: { state: string; last_result: string | null; wait_reason: string | null; approval_needed: boolean; approved_by_human: boolean }): StatusKey {
  if (t.state === "CREATED" || t.state === "CONTRACTED") return "queued";
  if (RUNNING.has(t.state)) return "running";
  if (CHECKING.has(t.state)) return "checking";
  if (t.state === "BLOCKED" && t.wait_reason === "stopped") return "stopped";
  if (t.last_result === "FAILED" || t.state === "BLOCKED") return "failed";
  if (t.approved_by_human && t.last_result === "VERIFIED") return "approved";
  if (t.state === "HELD" && t.wait_reason === "key_rejected") return "key";
  if (t.state === "HELD" && t.wait_reason === "empty_change") return "empty";
  if (t.last_result === "UNKNOWN" && (t.state === "HELD" || t.state === "GATED")) return "unknown";
  if (t.state === "HELD" || (t.state === "GATED" && t.approval_needed)) return "review";
  if (t.state === "GATED") return "checking";
  if (t.approved_by_human) return "approved";
  return "closed";
}

export type Group = "waiting" | "active" | "done";
export const GROUP_TITLE: Record<Group, string> = { waiting: "Чака теб", active: "В работа", done: "Готово" };
export function groupOf(k: StatusKey): Group {
  if (k === "review" || k === "failed" || k === "unknown" || k === "empty" || k === "key") return "waiting";
  if (k === "queued" || k === "running" || k === "checking") return "active";
  return "done";
}

/** The checks of a verdict in plain words (the detector id stays visible small, for the curious). */
export const CHECK_LABEL: Record<string, string> = {
  "D1.base_tests": "Съществуващите тестове минават",
  "D2.inventory": "Никой тест не е изтрит, прескочен или отслабен",
  "D3.protected": "Защитените файлове не са пипани",
  "D4.contract": "Промяната е само в разрешените файлове",
  "D10.lockfile": "Зависимостите не са сменени",
  MUST_PASS: "Задължителните тестове минават",
  EXPORT: "Промяната е изнесена от пясъчника безопасно",
  INTEGRITY: "Промяната е цяла и непроменена",
  CANARY: "Агентът не е изнесъл тайни",
};
export function checkLabel(detector: string): string {
  if (CHECK_LABEL[detector]) return CHECK_LABEL[detector];
  if (detector.startsWith("D7")) return "CI проверките";
  return detector;
}

export function ago(iso: string, now: Date = new Date()): string {
  const s = Math.round((Date.parse(iso) - now.getTime()) / 1000);
  const f = new Intl.RelativeTimeFormat("bg", { numeric: "auto" });
  const a = Math.abs(s);
  if (a < 60) return f.format(s, "second");
  if (a < 3600) return f.format(Math.round(s / 60), "minute");
  if (a < 86400) return f.format(Math.round(s / 3600), "hour");
  return f.format(Math.round(s / 86400), "day");
}
