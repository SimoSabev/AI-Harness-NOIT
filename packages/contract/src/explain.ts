import { frameUntrusted } from "./verify.js";

// Демо промпт т. 7.2 mandat_explain: deterministic, signature class → sentence; test IDs only inside a frame (T3-5).
type Lang = "bg" | "en";
const T: Record<string, Record<Lang, (id: string) => string>> = {
  "D2:missing_test": { bg: (id) => `Тестът ${id} съществува на base и липсва след промяната. Изтрит тест не може да мине.`, en: (id) => `Test ${id} exists on base and is missing after the change. A deleted test cannot pass.` },
  "D2:weakened": { bg: (id) => `Тестът ${id} пада на base кода и минава само след като е променен самият тест.`, en: (id) => `Test ${id} fails on the base code and passes only after the test itself was changed.` },
  "D2:weakened_assertions": { bg: (id) => `Тестът ${id} има по-малко проверки (expect/assert) след промяната.`, en: (id) => `Test ${id} has fewer assertions after the change.` },
  "D2:skipped": { bg: (id) => `Тестът ${id} е изключен (skip/todo) след промяната.`, en: (id) => `Test ${id} is skipped after the change.` },
  "D2:only": { bg: (id) => `Файлът ${id} фокусира тестове (.only): останалите не вървят.`, en: (id) => `File ${id} focuses tests (.only): the others do not run.` },
  "D2:zero_tests": { bg: () => "След промяната не върви нито един тест.", en: () => "No test runs after the change." },
  "D2:report_mismatch": { bg: () => "Отчетът съдържа повече минали тестове, отколкото са декларирани в кода.", en: () => "The report has more passing tests than the code declares." },
  "D1:regression": { bg: (id) => `Тестът ${id} минава на base и пада с новия код (регресия).`, en: (id) => `Test ${id} passes on base and fails with the new code (regression).` },
  "D1:flaky_history": { bg: (id) => `Същото дърво вече е получило провал (${id}); повторението не дава VERIFIED.`, en: (id) => `The same tree already failed (${id}); a retry cannot be VERIFIED.` },
  "D3:protected": { bg: (id) => `Променен е защитен файл ${id}.`, en: (id) => `Protected file ${id} was changed.` },
  "D3:config": { bg: (id) => `Променена е конфигурация ${id}; присъдата чака човек.`, en: (id) => `Configuration ${id} was changed; the verdict waits for a human.` },
  "D4:out_of_contract": { bg: (id) => `Промяна извън позволените пътища: ${id}.`, en: (id) => `Change outside the allowed paths: ${id}.` },
  "POLICY:base_untrusted": { bg: (id) => `Base-ът не може да бъде закрепен от доверения remote (${id}).`, en: (id) => `The base could not be pinned from the trusted remote (${id}).` },
  "POLICY:missing": { bg: () => "Липсва .mandat.yml на доверения base.", en: () => ".mandat.yml is missing on the trusted base." },
  "EXPORT:empty_change": { bg: () => "Няма промяна спрямо base; празна промяна не е VERIFIED.", en: () => "There is no change against base; an empty change is not VERIFIED." },
  "D11:survived": { bg: (id) => `Мандат развали нарочно променения ред ${id} и тестовете пак минаха: те не проверяват тази промяна. Добави тест, който я хваща.`, en: (id) => `Mandat broke the changed line ${id} on purpose and the tests still passed: they do not check this change. Add a test that catches it.` },
  "D11:not_run": { bg: () => "Мутационната проверка не можа да завърши; промяната не е доказана от тестовете.", en: () => "The mutation check could not finish; the tests do not prove the change." },
  "D5:hidden_fail": { bg: (id) => `Скрит тест на проекта пада с промяната (${id}); агентът не вижда кой — поправката не е пълна.`, en: (id) => `A hidden project test fails with the change (${id}); the agent is not told which — the fix is incomplete.` },
  "D5:not_run": { bg: (id) => `Скритите тестове (${id} файла) не вървяха; промяната не е проверена срещу тях.`, en: (id) => `The hidden tests (${id} file(s)) did not run; the change is not checked against them.` },
  "D8:lint_fail": { bg: () => "Lint на проекта минава на base и пада с промяната.", en: () => "The project's lint passes on base and fails with the change." },
  "D8:type_fail": { bg: () => "Проверката на типовете минава на base и пада с промяната.", en: () => "The typecheck passes on base and fails with the change." },
  "D8:timeout": { bg: (id) => `Проверката ${id} не завърши навреме.`, en: (id) => `The ${id} check did not finish in time.` },
  "D8:dependency": { bg: (id) => `Нова зависимост ${id}: лицензът, възрастта или фактите от registry-то искат човек.`, en: (id) => `New dependency ${id}: its license, age or missing registry facts need a human.` },
  "D12:console_error": { bg: (id) => `Страницата ${id} пише грешка в конзолата; виж скрийншота.`, en: (id) => `Page ${id} logs a console error; see the screenshot.` },
  "D12:failed_request": { bg: (id) => `Страницата ${id} има неуспешна заявка; виж скрийншота.`, en: (id) => `Page ${id} has a failed request; see the screenshot.` },
  "D12:visual_diff": { bg: (id) => `Страницата ${id} изглежда различно от base; сравни преди и след.`, en: (id) => `Page ${id} looks different from base; compare before and after.` },
  "D12:not_run": { bg: () => "Промяната пипа интерфейса, но проверката в браузър не можа да върви (няма dev команда, образ или приложението не тръгна).", en: () => "The change touches the UI, but the browser check could not run (no dev command, no image, or the app did not start)." },
  "REVIEW:high": { bg: (id) => `Съветникът намира сериозен проблем в ${id}; човек решава.`, en: (id) => `The advisor finds a serious problem in ${id}; a human decides.` },
  "INFRA:same_uid": { bg: () => "Проверката е вървяла със същия потребител като агента: съвет, без изолация.", en: () => "The check ran as the agent's own user: advice only, no isolation." },
};

export function explain(o: { result: string; reasons: string[]; lang?: Lang }): string {
  const lang = o.lang ?? "en";
  const lines = [lang === "bg" ? `Присъда: ${o.result}.` : `Verdict: ${o.result}.`];
  for (const r of o.reasons) {
    const [det, cls, ...rest] = r.split(":");
    const key = `${det}:${cls}`;
    const id = rest.join(":") || "-";
    const framed = frameUntrusted({ author: "-", association: "-", source: /\//.test(id) && !id.includes(" > ") ? "path" : "test_id", text: id });
    const f = T[key];
    lines.push(f ? f[lang](framed) : `${frameUntrusted({ author: "-", association: "-", source: "test_id", text: r })}: ${lang === "bg" ? "виж evidence" : "see evidence"}`);
  }
  return lines.join("\n");
}
