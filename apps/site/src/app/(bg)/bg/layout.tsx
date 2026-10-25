import type { ReactNode } from "react";
import { SiteHtml } from "../../../components/site-html";

export { viewport } from "../../../components/site-html";

export default function BgLayout({ children }: { children: ReactNode }) {
  return <SiteHtml lang="bg">{children}</SiteHtml>;
}
