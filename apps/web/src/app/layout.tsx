import "./globals.css";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { LangProvider } from "../i18n/client";
import { getLang, getT } from "../i18n/server";
import { LocalCsrf } from "../components/local-csrf";
import { SecondFactorProvider } from "../components/second-factor";
import { HARNESS } from "../lib/brand";
import { parseTheme } from "../lib/prefs";
import { authMode } from "../lib/server/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: HARNESS || t("meta.title"), description: t("meta.description") };
}
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0c0f0d" }, { media: "(prefers-color-scheme: light)", color: "#f3f4f1" }] };

// D-305: the theme is a cookie (Settings), so the server paints the right one from the first byte.
// E7f: so is the language (cookie `lang`, else Accept-Language, else English); <html lang> follows it.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get("theme")?.value);
  const lang = await getLang();
  return (
    <html lang={lang} data-theme={theme}>
      <body className="min-h-screen">
        <LangProvider lang={lang}>
          {authMode() === "local" && <LocalCsrf />}
          <SecondFactorProvider needsCode={authMode() !== "local"}>{children}</SecondFactorProvider>
        </LangProvider>
      </body>
    </html>
  );
}
