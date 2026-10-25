// The dev server of the D12 fixture: static files of web/ on $HOST:$PORT (the harness sets 0.0.0.0:4173).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.join(import.meta.dirname, "public");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };
createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const rel = url.pathname === "/" ? "index.html" : url.pathname.endsWith("/") ? `${url.pathname.slice(1)}index.html` : url.pathname.slice(1);
  const file = path.join(root, path.normalize(rel));
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(Number(process.env.PORT ?? 4173), process.env.HOST ?? "127.0.0.1");
