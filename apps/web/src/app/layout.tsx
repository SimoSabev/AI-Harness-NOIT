import "./globals.css";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { HARNESS } from "../lib/brand";
import { parseTheme } from "../lib/prefs";

export const metadata: Metadata = { title: HARNESS || "Задачи", description: "Задачи за AI агенти с проверка, която агентът не може да заобиколи." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0c0f0d" }, { media: "(prefers-color-scheme: light)", color: "#f3f4f1" }] };

// D-305: the theme is a cookie (Настройки), so the server paints the right one from the first byte.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get("theme")?.value);
  return (
    <html lang="bg" data-theme={theme}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
