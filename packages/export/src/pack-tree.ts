import { readdirSync } from "node:fs";
import { Readable } from "node:stream";
import * as tar from "tar";

const hasGitComponent = (p: string): boolean => p.split("/").some((c) => c.toLowerCase() === ".git");

/** D-114: seed tar with node-tar, portable, without any ".git" component and without top-level node_modules. */
export function packTree(dir: string): NodeJS.ReadableStream {
  const top = readdirSync(dir).filter((n) => n.toLowerCase() !== ".git" && n !== "node_modules").sort();
  if (top.length === 0) return Readable.from([Buffer.alloc(1024)]);
  return tar.c({ cwd: dir, portable: true, filter: (p) => !hasGitComponent(p.replace(/^\.\//, "")) }, top) as unknown as NodeJS.ReadableStream;
}
