"use client";

import { useEffect, useState } from "react";
import { pagePath, translator } from "../i18n/t";
import type { Lang } from "../i18n/t";
import { detectOs, platformAnchor } from "../lib/os";
import type { Os } from "../lib/os";
import { btn } from "./ui";

interface UaData {
  platform?: string;
  mobile?: boolean;
}

// E9g B (D-377): "Download for <your OS>". The static HTML says "Download" (→ /download/); in the browser it reads the
// system from navigator and points at that section. Nothing is stored or sent.
export function DownloadButton({ lang, small = false }: { lang: Lang; small?: boolean }) {
  const t = translator(lang);
  const [os, setOs] = useState<Os>("unknown");
  useEffect(() => {
    const ua = (navigator as Navigator & { userAgentData?: UaData }).userAgentData;
    setOs(detectOs({ userAgent: navigator.userAgent, platform: ua?.platform, mobile: ua?.mobile, maxTouchPoints: navigator.maxTouchPoints }));
  }, []);
  const base = pagePath(lang, "/download/");
  // D-606: the header's button is the compact one
  const cls = small ? `${btn.primary} px-3 py-1.5` : `${btn.primary} px-5 py-2.5 text-[15px]`;
  if (os === "unknown") return <a className={cls} href={base}>{t("download.ctaAny")}</a>;
  if (os === "phone") return <a className={cls} href={`${base}#${platformAnchor("phone")}`}>{t("download.ctaPhone")}</a>;
  return (
    <a className={cls} href={`${base}#${platformAnchor(os)}`} data-os={os}>
      {t("download.cta", { os: t(`os.${os}`) })}
    </a>
  );
}
