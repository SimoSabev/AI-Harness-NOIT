// Демо промпт т. 8.4: push → showNotification; notificationclick → /tasks/<id>. No caching of data (privacy first).
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
  const title = typeof d.title === "string" ? d.title.slice(0, 80) : "Мандат";
  const body = [d.verdict, typeof d.level === "number" ? `ниво ${d.level}` : null].filter(Boolean).join(" · ");
  event.waitUntil(self.registration.showNotification(title, { body, tag: id ?? "mandat", data: { url: id ? `/tasks/${id}` : "/" }, icon: "/icon-192.png" }));
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
