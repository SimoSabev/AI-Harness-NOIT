"use client";
import { useCallback, useEffect, useState } from "react";
import { FolderListing, FoundProjects } from "@mandat/contract";
import type { z } from "zod";
import { useT } from "../i18n/client";
import type { Key } from "../i18n/t";
import { folderCrumbs } from "../lib/folder-path";
import { label } from "./ui";

// D-388 (folder picker): "Add project" in a browser. A browser cannot hand over a folder's full path, so `mandat local`
// lists the folders of this computer (names and paths only): the git projects it found in the usual places, and a
// navigator from the home folder down. Picking a git folder adds it through the same flow as the typed path.

type Load<V> = { state: "loading" } | { state: "ok"; value: V } | { state: "error"; message: Key };

const rowBtn = "min-w-0 flex-1 rounded-md px-2 py-1.5 text-left transition hover:bg-raised disabled:opacity-50";
const smallBtn = "inline-flex shrink-0 items-center rounded-md border border-line-strong bg-panel px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-raised disabled:opacity-50";
const addBtn = "inline-flex shrink-0 items-center rounded-md bg-accent px-3 py-1 font-display text-xs font-medium tracking-wide text-accent-ink transition hover:brightness-110 disabled:opacity-50";

async function getParsed<V>(url: string, schema: z.ZodType<V>): Promise<Load<V>> {
  const r = await fetch(url, { credentials: "same-origin", cache: "no-store" }).catch(() => null);
  if (!r) return { state: "error", message: "add.err.unavailable" };
  if (r.status === 502 || r.status === 503) return { state: "error", message: "add.err.unavailable" };
  if (r.status === 404) return { state: "error", message: "add.err.not_a_folder" };
  const v = schema.safeParse(r.ok ? await r.json().catch(() => null) : null);
  return v.success ? { state: "ok", value: v.data } : { state: "error", message: "add.err.load" };
}

function FoundList({ busy, onAdd }: { busy: boolean; onAdd: (path: string) => void }) {
  const t = useT();
  const [found, setFound] = useState<Load<FoundProjects>>({ state: "loading" });
  useEffect(() => {
    let live = true;
    void getParsed("/api/folders/found", FoundProjects).then((f) => live && setFound(f));
    return () => {
      live = false;
    };
  }, []);
  return (
    <section aria-labelledby="found-h">
      <h3 id="found-h" className={label}>{t("add.found.title")}</h3>
      <p className="mt-1 text-sm text-mute">{t("add.found.hint")}</p>
      {found.state === "loading" && <p role="status" className="mt-3 text-sm text-mute">{t("add.found.loading")}</p>}
      {found.state === "error" && <p role="alert" className="mt-3 text-sm text-bad">{t(found.message)}</p>}
      {found.state === "ok" && found.value.found.length === 0 && <p className="mt-3 text-sm text-mute">{t("add.found.none")}</p>}
      {found.state === "ok" && found.value.found.length > 0 && (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line">
          {found.value.found.map((p) => (
            <li key={p.path}>
              <button type="button" className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-raised disabled:opacity-50" disabled={busy} onClick={() => onAdd(p.path)} aria-label={t("add.found.add", { name: p.name })}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                  <span className="block truncate font-mono text-xs text-mute">{p.path}</span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-xs font-medium text-accent-text opacity-70 transition group-hover:opacity-100">{t("add.browse.add")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Crumbs({ path, onOpen }: { path: string; onOpen: (path: string) => void }) {
  const t = useT();
  const crumbs = folderCrumbs(path);
  return (
    <nav aria-label={t("add.browse.path")} className="min-w-0 flex-1">
      <ol className="flex flex-wrap items-center gap-0.5 font-mono text-xs">
        {crumbs.map((c, i) => (
          <li key={c.path} className="flex items-center gap-0.5">
            {i > 1 && <span aria-hidden="true" className="text-mute">›</span>}
            {i === crumbs.length - 1 ? (
              <span aria-current="location" className="rounded px-1.5 py-0.5 font-medium text-ink">{c.name}</span>
            ) : (
              <button type="button" className="rounded px-1.5 py-0.5 text-mute transition hover:bg-raised hover:text-ink" onClick={() => onOpen(c.path)}>{c.name}</button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Browser({ busy, onAdd }: { busy: boolean; onAdd: (path: string) => void }) {
  const t = useT();
  const [list, setList] = useState<Load<FolderListing>>({ state: "loading" });
  const [last, setLast] = useState<FolderListing | null>(null);
  const open = useCallback((p?: string) => {
    setList({ state: "loading" });
    void getParsed(p === undefined ? "/api/folders" : `/api/folders?path=${encodeURIComponent(p)}`, FolderListing).then((l) => {
      setList(l);
      if (l.state === "ok") setLast(l.value);
    });
  }, []);
  useEffect(() => open(), [open]);
  const shown = list.state === "ok" ? list.value : last;
  return (
    <section aria-labelledby="browse-h">
      <h3 id="browse-h" className={label}>{t("add.browse.title")}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className={smallBtn} disabled={!shown?.parent || list.state === "loading"} onClick={() => shown?.parent && open(shown.parent)}>
          <span aria-hidden="true">↑</span> {t("add.browse.up")}
        </button>
        <button type="button" className={smallBtn} disabled={list.state === "loading"} onClick={() => open()}>{t("add.browse.home")}</button>
        {shown && shown.roots.length > 1 && (
          <span role="group" aria-label={t("add.browse.roots")} className="flex flex-wrap gap-1">
            {shown.roots.map((r) => (
              <button key={r} type="button" className={`${smallBtn} font-mono`} aria-pressed={shown.path.toLowerCase().startsWith(r.toLowerCase())} onClick={() => open(r)}>{r}</button>
            ))}
          </span>
        )}
      </div>
      {shown && <div className="mt-2 flex"><Crumbs path={shown.path} onOpen={open} /></div>}
      {list.state === "error" && <p role="alert" className="mt-3 text-sm text-bad">{t(list.message)}</p>}
      <div aria-busy={list.state === "loading"} className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-line bg-canvas">
        {list.state === "loading" && <p role="status" className="px-3 py-2.5 text-sm text-mute">{t("add.browse.loading")}</p>}
        {list.state === "ok" && list.value.entries.length === 0 && <p className="px-3 py-2.5 text-sm text-mute">{t("add.browse.empty")}</p>}
        {list.state === "ok" && list.value.entries.length > 0 && (
          <ul className="divide-y divide-line">
            {list.value.entries.map((e) => (
              <li key={e.path} className="flex items-center gap-2 px-1.5 py-1">
                <button type="button" className={rowBtn} onClick={() => open(e.path)} aria-label={t("add.browse.open", { name: e.name })}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden="true" className={`hex inline-block h-2 w-2.5 shrink-0 ${e.git ? "bg-accent" : "bg-idle"}`} />
                    <span className={`truncate text-sm ${e.git ? "font-medium text-ink" : "text-ink"}`}>{e.name}</span>
                    {e.git && <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[11px] text-mute">{t("add.browse.git")}</span>}
                  </span>
                </button>
                {e.git && (
                  <button type="button" className={addBtn} disabled={busy} onClick={() => onAdd(e.path)} aria-label={t("add.found.add", { name: e.name })}>{t("add.browse.add")}</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {list.state === "ok" && list.value.truncated && <p className="mt-2 text-xs text-mute">{t("add.browse.truncated", { n: list.value.entries.length })}</p>}
    </section>
  );
}

/** The found projects and the folder navigator; `onAdd` registers a folder (the same flow as the typed path). */
export function FolderPicker({ busy, onAdd }: { busy: boolean; onAdd: (path: string) => void }) {
  return (
    <div className="space-y-6">
      <FoundList busy={busy} onAdd={onAdd} />
      <Browser busy={busy} onAdd={onAdd} />
    </div>
  );
}
