// Browser side of the internal API: the CSRF double-submit header from the mandat_csrf cookie.
export function csrfToken(): string {
  const m = /(?:^|;\s*)mandat_csrf=([^;]+)/.exec(typeof document === "undefined" ? "" : document.cookie);
  return m ? decodeURIComponent(m[1] ?? "") : "";
}

export async function postJson(url: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-mandat-csrf": csrfToken() }, body: JSON.stringify(body), credentials: "same-origin" });
  const parsed = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: r.status, body: parsed };
}

export const ERROR_TEXT: Record<string, string> = {
  head_sha_moved: "Промяната е обновена след като я отвори. Презареди картата и провери отново.",
  already_approved: "Вече е одобрено.",
  second_factor_required: "Нужен е код от приложението за удостоверяване.",
  second_factor_invalid: "Кодът не е верен или е изтекъл.",
  second_factor_rejected: "Проверката на кода е изтекла (над 2 мин). Въведи нов код.",
  not_an_approver: "Нямаш права да одобряваш.",
  not_retryable: "Задачата не може да се повтори в това състояние.",
  no_attempts_left: "Опитите са изчерпани.",
  not_stoppable: "Задачата не може да се спре в това състояние.",
  rate_limited: "Твърде много заявки. Опитай след минута.",
};
