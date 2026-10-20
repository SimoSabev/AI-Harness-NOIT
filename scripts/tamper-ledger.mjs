#!/usr/bin/env node
// Copies a ledger and changes ONE field on ONE line without fixing the hash (demo of `mandat verify-log`).
// usage: node scripts/tamper-ledger.mjs <in> <out> --line <n> --field <name> --value <string> | --json-value <json>
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { line: { type: "string" }, field: { type: "string" }, value: { type: "string" }, "json-value": { type: "string" } },
});
const [input, output] = positionals;
const lineNo = Number(values.line);
if (!input || !output || !Number.isInteger(lineNo) || lineNo < 1 || !values.field || (values.value === undefined) === (values["json-value"] === undefined)) {
  console.error("usage: tamper-ledger.mjs <in> <out> --line <n> --field <name> (--value <string> | --json-value <json>)");
  process.exit(2);
}
const lines = readFileSync(input, "utf8").split("\n");
const target = lines[lineNo - 1];
if (target === undefined || target === "") {
  console.error(`line ${lineNo} does not exist`);
  process.exit(2);
}
const entry = JSON.parse(target);
entry[values.field] = values.value !== undefined ? values.value : JSON.parse(values["json-value"]);
lines[lineNo - 1] = JSON.stringify(entry);
writeFileSync(output, lines.join("\n"));
console.log(`tampered line ${lineNo} field ${values.field} → ${output}`);
