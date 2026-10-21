import "./globals.css";
import type { Metadata, Viewport } from "next";
import { HARNESS } from "../lib/brand";

export const metadata: Metadata = { title: HARNESS, description: "Задачи за AI агенти с проверка, която агентът не може да заобиколи." };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bg">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
