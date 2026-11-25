import "./globals.css";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { LangProvider } from "../i18n/client";
import { getLang, getT } from "../i18n/server";
import { DesktopCommands } from "../components/desktop-commands";
import { LocalCsrf } from "../components/local-csrf";
import { SecondFactorProvider } from "../components/second-factor";
import { VoiceButton } from "../components/voice-button";
import { FAVICON, HARNESS } from "../lib/brand";
import { parseTheme } from "../lib/prefs";
import { appearanceAttrs, parseAppearance } from "../lib/appearance";
import { authMode } from "../lib/server/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: HARNESS || t("meta.title"), description: t("meta.description"), icons: { icon: [FAVICON, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }] } };
}
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#10161a" }, { media: "(prefers-color-scheme: light)", color: "#f3f6f7" }] };

// D-305: the theme is a cookie (Settings), so the server paints the right one from the first byte.
// E7f: so is the language (cookie `lang`, else Accept-Language, else English); <html lang> follows it.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const theme = parseTheme(jar.get("theme")?.value);
  // D-599: the person's accent, ground, Nova colour and size (Settings → Appearance), painted from the first byte
  const look = appearanceAttrs(parseAppearance({ accent: jar.get("accent")?.value, ground: jar.get("ground")?.value, nova: jar.get("nova")?.value, scale: jar.get("scale")?.value }));
  const lang = await getLang();
  return (
    <html lang={lang} data-theme={theme} {...look.data} style={look.style as React.CSSProperties}>
      <body className="min-h-screen">
        <LangProvider lang={lang}>
          {authMode() === "local" && <LocalCsrf />}
          <DesktopCommands />
          <SecondFactorProvider needsCode={authMode() !== "local"}>{children}</SecondFactorProvider>
          {/* D-556: Jarvis — here, not in a page, so a conversation survives moving between screens */}
          {authMode() === "local" && <VoiceButton />}
        </LangProvider>
      </body>
    </html>
  );
}
