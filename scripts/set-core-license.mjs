#!/usr/bin/env node
// В-1 / D-204 / демо промпт т. 4.2 и 4.4: switch the core packages between "Apache-2.0" (default) and
// "Apache-2.0 OR GPL-3.0-or-later" (dual; Simo decides after the regulation check, Q-017). --dry-run prints the
// changes and writes nothing.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { workspacePackages } from "./check-licenses.mjs";
import { groupOf } from "./license-groups.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LICENSES = Object.freeze({ apache: "Apache-2.0", dual: "Apache-2.0 OR GPL-3.0-or-later" });
const BEGIN = "<!-- mandat-license:begin -->";
const END = "<!-- mandat-license:end -->";
const DUAL_LINE = "Лиценз: Apache-2.0 OR GPL-3.0-or-later по ваш избор (LICENSE и licenses/LICENSE-GPL-3.0-or-later.txt).";

/** Replaces or removes the marked license block of a README. */
export function readmeWith(text, mode) {
  const block = mode === "dual" ? `${BEGIN}\n${DUAL_LINE}\n${END}\n` : "";
  const re = new RegExp(`${BEGIN}[\\s\\S]*?${END}\\n?`);
  if (re.test(text)) return text.replace(re, block);
  if (!block) return text;
  return `${text}${text === "" || text.endsWith("\n") ? "" : "\n"}${text === "" ? "" : "\n"}${block}`;
}

/**
 * @param {"apache"|"dual"} mode
 * @param {{ dir: string, packageJson: string, readme: string | null }[]} pkgs
 * @returns {{ file: string, before: string, after: string }[]} only the files that change
 */
export function plan(mode, pkgs) {
  if (!(mode in LICENSES)) throw new Error(`--mode must be apache or dual, got ${String(mode)}`);
  const changes = [];
  for (const p of pkgs) {
    const pj = JSON.parse(p.packageJson);
    const after = JSON.stringify({ ...pj, license: LICENSES[mode] }, null, 2) + "\n";
    if (after !== p.packageJson) changes.push({ file: path.join(p.dir, "package.json"), before: p.packageJson, after });
    const readme = readmeWith(p.readme ?? "", mode);
    if (readme !== (p.readme ?? "")) changes.push({ file: path.join(p.dir, "README.md"), before: p.readme ?? "", after: readme });
  }
  return changes;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--mode");
  const mode = i >= 0 ? args[i + 1] : "apache";
  const dry = args.includes("--dry-run");
  const pkgs = workspacePackages()
    .filter((p) => groupOf(p.name) === "core")
    .map((p) => {
      const rp = path.join(p.dir, "README.md");
      return { dir: p.dir, packageJson: readFileSync(path.join(p.dir, "package.json"), "utf8"), readme: existsSync(rp) ? readFileSync(rp, "utf8") : null };
    });
  let changes;
  try {
    changes = plan(mode, pkgs);
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(2);
  }
  for (const c of changes) {
    const rel = path.relative(repo, c.file);
    if (rel.endsWith("package.json")) console.log(`${dry ? "[dry-run] " : ""}${rel}: license → ${LICENSES[mode]}`);
    else console.log(`${dry ? "[dry-run] " : ""}${rel}: ${mode === "dual" ? "+ ред за dual лиценз" : "− ред за dual лиценз"}`);
    if (!dry) writeFileSync(c.file, c.after);
  }
  if (changes.length === 0) console.log(`no changes (core already ${LICENSES[mode]})`);
}
