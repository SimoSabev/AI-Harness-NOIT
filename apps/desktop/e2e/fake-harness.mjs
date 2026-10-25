#!/usr/bin/env node
// E9g A5 (D-376): a stand-in for `pnpm local` in the Electron e2e (MANDAT_DESKTOP_FAKE_HARNESS, unpackaged builds only).
// It prints the same banner, serves a tiny page with the same contract as the real web (GET /api/inbox, the
// harness:event commands → the same pages: /tasks/new, /projects/add?path=…) and records what main asked for.
// No Docker, no database: the e2e tests the desktop layer (window, bridge, menu, drop, grants), not the harness.
import { createServer } from "node:http";

const INBOX = { items: [{ id: "t_e2e_discount", text: "Fix the 10% discount" }, { id: "t_e2e_tests", text: "Add tests for checkout" }] };
const hits = { inbox: 0 };

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>
<h1 id="title">${title}</h1>${body}
<input type="file" id="f" aria-label="file">
<script>
  window.__cmds = [];
  const b = window.harnessDesktop;
  if (b) b.onCommand((c) => {
    window.__cmds.push(c);
    if (c.command === "new_task") location.href = "/tasks/new";
    if (c.command === "add_project") location.href = "/projects/add?path=" + encodeURIComponent(c.path);
  });
</script></body></html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/login") {
    res.writeHead(307, { location: "/" }).end();
  } else if (url.pathname === "/api/inbox") {
    hits.inbox++;
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(INBOX));
  } else if (url.pathname === "/__hits") {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(hits));
  } else if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page("Inbox", `<ul>${INBOX.items.map((i) => `<li>${i.text}</li>`).join("")}</ul>`));
  } else if (url.pathname === "/tasks/new") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page("New task", ""));
  } else if (url.pathname === "/projects/add") {
    const p = (url.searchParams.get("path") ?? "").replace(/[<>&"]/g, "");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page("Add project", `<p id="path">${p}</p>`));
  } else {
    res.writeHead(404).end();
  }
});

server.listen(0, "127.0.0.1", () => {
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  process.stdout.write(`\n  Open:  http://127.0.0.1:${port}\n  Login: none\n\n`);
});
const stop = () => server.close(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
