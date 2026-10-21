// D-298: the auto-harness in plain words — what each field of .mandat.yml means and where the scanner took it from.
export const FIELD_LABEL: Record<string, string> = {
  "runtime.package_manager": "Мениджър на пакетите",
  "runtime.install": "Команда за инсталиране",
  "runtime.node": "Версия на Node",
  "tests.framework": "Тестова рамка",
  "tests.command": "Команда за тестовете",
  "tests.test_globs": "Къде са тестовете",
  "ci.workflow": "CI процес",
  "ci.required_checks": "Задължителни CI проверки",
  "risk_classes": "Класове риск",
  "task_types": "Видове задачи",
};

export const SOURCE_LABEL: Record<string, string> = {
  lockfile: "от lockfile",
  "ci.yml": "от CI конфигурацията",
  "package.json#scripts.test": "от package.json (scripts.test)",
  baseline: "от пробно пускане на тестовете",
  default: "по подразбиране",
  human: "потвърди ти",
};

export const PROPOSAL_STATUS: Record<string, { label: string; tone: "gray" | "blue" | "green" | "red" | "amber" }> = {
  proposed: { label: "Чака одобрение", tone: "amber" },
  approved: { label: "Одобрени", tone: "green" },
  draft: { label: "Чернова", tone: "gray" },
  accepted: { label: "Приети", tone: "green" },
  rejected: { label: "Отказани", tone: "red" },
};

export function fieldLabel(key: string): string {
  return FIELD_LABEL[key] ?? key;
}

export function sourceLabel(src: string): string {
  return SOURCE_LABEL[src] ?? src;
}

/** Fields the scanner could not settle: the human has to confirm them before the rules hold. */
export function humanFields(sources: Record<string, string>): string[] {
  return Object.entries(sources).filter(([, s]) => s === "human").map(([k]) => k).sort();
}
