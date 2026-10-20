"use client";
import { useEffect, useState } from "react";
import { postJson } from "../lib/client/api";

// т. 8.4: register the service worker; ask for notifications ONLY on a click (iOS ≥ 16.4: only from the Home Screen).
const b64ToBytes = (s: string) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export function PushControl({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<"idle" | "unsupported" | "ios_home" | "on" | "denied" | "error">("idle");
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    if (ios && !standalone) setState("ios_home");
    else if (!("PushManager" in window) || !vapidPublicKey) setState("unsupported");
  }, [vapidPublicKey]);
  const enable = async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidPublicKey ?? "") });
      const r = await postJson("/api/push/subscribe", sub.toJSON());
      setState(r.status < 300 ? "on" : "error");
    } catch {
      setState("error");
    }
  };
  if (state === "ios_home") return <p className="hint">На iPhone/iPad известията работят само от началния екран: Сподели → „Добави към началния екран“, после отвори Мандат оттам.</p>;
  if (state === "unsupported") return null;
  if (state === "on") return <p className="muted" role="status">Известията са включени.</p>;
  return (
    <p>
      <button className="btn" type="button" onClick={() => void enable()}>Включи известия</button>
      {state === "denied" && <span className="muted"> Известията са забранени в браузъра.</span>}
      {state === "error" && <span className="error"> Не успя. Опитай пак.</span>}
    </p>
  );
}
