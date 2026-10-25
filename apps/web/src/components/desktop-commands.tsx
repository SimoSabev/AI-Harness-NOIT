"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { desktopBridge } from "../lib/client/desktop";
import { commandAction, isTyping, runCommandAction } from "../lib/client/desktop-commands";

// E9g A2: in the desktop window, the commands of the native menu, the shortcuts and the notification clicks reach the
// page here. In a browser or the PWA there is no bridge: this renders nothing and listens to nothing.
export function DesktopCommands() {
  const router = useRouter();
  useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge) return;
    return bridge.onCommand((cmd) => {
      const typing = isTyping(document.activeElement as HTMLElement | null);
      runCommandAction(commandAction(cmd, { typing }), { querySelector: (s) => document.querySelector<HTMLElement>(s) }, (href) => router.push(href));
    });
  }, [router]);
  return null;
}
