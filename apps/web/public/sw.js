// Demo prompt §8.4: push → showNotification; notificationclick → /tasks/<id>. No caching of data (privacy first).
// E7f (D-348): the notification speaks the language of the device (navigator.language: bg → Bulgarian, else English).
// The worker's payload (apps/worker/src/online/push.ts) carries kind + "<head>: <task text>" + the verdict word; the head
// and the word are re-rendered here from `kind` and the verdict, so the text the person reads is in their language.
const BG = /^bg\b/i.test((self.navigator && self.navigator.language) || "");
const T = BG
  ? { judge: "Мандат", level: (n) => `ниво ${n}`, head: { waiting: "Чака теб", failed: "ПРОВАЛ", merged: "Слято само" }, verdict: { VERIFIED: "ПРОВЕРЕНО", FAILED: "ПРОВАЛ", UNKNOWN: "НЕИЗВЕСТНО" } }
  : { judge: "Mandat", level: (n) => `level ${n}`, head: { waiting: "Waiting for you", failed: "FAILED", merged: "Merged on its own" }, verdict: { VERIFIED: "VERIFIED", FAILED: "FAILED", UNKNOWN: "UNKNOWN" } };
const VERDICT_CODE = { "ПРОВЕРЕНО": "VERIFIED", "ПРОВАЛ": "FAILED", "НЕИЗВЕСТНО": "UNKNOWN", VERIFIED: "VERIFIED", FAILED: "FAILED", UNKNOWN: "UNKNOWN" };

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  let d;
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = {};
  }
  const id = typeof d.task_id === "string" && /^t_[a-z0-9_]{1,40}$/.test(d.task_id) ? d.task_id : null;
  const raw = typeof d.title === "string" ? d.title : "";
  const head = typeof d.kind === "string" ? T.head[d.kind] : undefined;
  const text = raw.includes(": ") ? raw.slice(raw.indexOf(": ") + 2) : raw;
  const title = (head && text ? `${head}: ${text}` : raw || T.judge).slice(0, 80);
  const code = typeof d.verdict === "string" ? VERDICT_CODE[d.verdict] : undefined;
  const verdict = code ? T.verdict[code] : d.verdict;
  const body = [verdict, typeof d.level === "number" ? T.level(d.level) : null].filter(Boolean).join(" · ");
  event.waitUntil(self.registration.showNotification(title, { body, lang: BG ? "bg" : "en", tag: id ?? "mandat", data: { url: id ? `/tasks/${id}` : "/" }, icon: "/icon-192.png" }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.navigate(url).then((w) => (w ? w.focus() : undefined));
      return self.clients.openWindow(url);
    }),
  );
});
