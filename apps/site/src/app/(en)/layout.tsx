import type { ReactNode } from "react";
import { SiteHtml } from "../../components/site-html";

export { viewport } from "../../components/site-html";

export default function EnLayout({ children }: { children: ReactNode }) {
  return <SiteHtml lang="en">{children}</SiteHtml>;
}
