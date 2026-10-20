import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "Мандат", description: "Задачи на AI агенти с присъда от системи, до които агентът няма достъп." };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// The theme is applied before paint from this browser's choice (no flash); only a constant inline script.
const THEME = `try{var t=localStorage.getItem("mandat-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bg" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
