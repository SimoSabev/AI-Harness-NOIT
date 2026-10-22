"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../i18n/client";
import type { Key } from "../i18n/t";
import { errorText, postJson } from "../lib/client/api";
import { btn, card, input } from "./ui";

const ERR: Record<string, Key> = { last_role_manager: "roles.lastManager", name_taken: "roles.nameTaken", bad_role: "roles.badRole" };
const TYPES = ["bugfix", "feature", "css", "docs"] as const;

// E8c: create a role (capabilities + scope) and change the role of a member; every change is a ledger row on the server.
export function RolesManager({ capabilities, dangerous, roles, members }: { capabilities: string[]; dangerous: string[]; roles: { id: string; name: string }[]; members: { user_id: string; email: string | null; role_id: string }[] }) {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState("");
  const [caps, setCaps] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [level, setLevel] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const toggle = (xs: string[], x: string) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await postJson("/api/roles", { name: name.trim(), capabilities: caps, scope: { repos: null, task_types: types.length ? types : null, level_cap: level === "" ? null : Number(level), budget_usd_day: null } });
    setMsg(r.status === 201 ? { ok: true, text: t("roles.created") } : { ok: false, text: errorText(t, r, ERR) });
    if (r.status === 201) {
      setName("");
      setCaps([]);
      setTypes([]);
      setLevel("");
    }
    router.refresh();
  };
  const assign = async (member: string, roleId: string) => {
    const r = await postJson(`/api/members/${encodeURIComponent(member)}/role`, { role_id: roleId }, "PATCH");
    setMsg(r.status === 200 ? { ok: true, text: t("roles.assigned") } : { ok: false, text: errorText(t, r, ERR) });
    router.refresh();
  };
  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-2">
      <section aria-labelledby="r-members" className={`${card} p-5`}>
        <h2 id="r-members" className="font-display text-base font-semibold">{t("roles.members")}</h2>
        <ul className="mt-3 divide-y divide-line">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="truncate">{m.email ?? m.user_id}</span>
              <label className="flex items-center gap-2">
                <span className="sr-only">{t("roles.assign")} — {m.email ?? m.user_id}</span>
                <select className={input} value={m.role_id} onChange={(e) => void assign(m.user_id, e.target.value)}>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
      </section>
      <form onSubmit={(e) => void create(e)} aria-labelledby="r-new" className={`${card} p-5`}>
        <h2 id="r-new" className="font-display text-base font-semibold">{t("roles.new")}</h2>
        <label className="mt-3 block text-sm">
          {t("roles.name")}
          <input className={`${input} mt-1 w-full`} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
        </label>
        <fieldset className="mt-3">
          <legend className="text-sm">{t("roles.capabilities")}</legend>
          <div className="mt-1 grid grid-cols-2 gap-1">
            {capabilities.map((c) => (
              <label key={c} className="flex items-center gap-2 font-mono text-xs">
                <input type="checkbox" checked={caps.includes(c)} onChange={() => setCaps(toggle(caps, c))} />
                <span className={dangerous.includes(c) ? "text-warn" : ""}>{c}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="mt-3">
          <legend className="text-sm">{t("roles.taskTypes")}</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {TYPES.map((x) => (
              <label key={x} className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={types.includes(x)} onChange={() => setTypes(toggle(types, x))} />
                {x}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-3 block text-sm">
          {t("roles.levelCap")}
          <select className={`${input} mt-1`} value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">{t("roles.noCap")}</option>
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={String(n)}>{n}</option>
            ))}
          </select>
        </label>
        <button type="submit" className={`${btn.primary} mt-4`}>{t("roles.create")}</button>
      </form>
      {msg && <p role="status" className={`text-sm lg:col-span-2 ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
    </div>
  );
}
