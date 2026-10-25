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
export function DownloadButton({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const [os, setOs] = useState<Os>("unknown");
  useEffect(() => {
    const ua = (navigator as Navigator & { userAgentData?: UaData }).userAgentData;
    setOs(detectOs({ userAgent: navigator.userAgent, platform: ua?.platform, mobile: ua?.mobile, maxTouchPoints: navigator.maxTouchPoints }));
  }, []);
  const base = pagePath(lang, "/download/");
  if (os === "unknown") return <a className={btn.primary} href={base}>{t("download.ctaAny")}</a>;
  if (os === "phone") return <a className={btn.primary} href={`${base}#${platformAnchor("phone")}`}>{t("download.ctaPhone")}</a>;
  return (
    <a className={btn.primary} href={`${base}#${platformAnchor(os)}`} data-os={os}>
      {t("download.cta", { os: t(`os.${os}`) })}
    </a>
  );
}
