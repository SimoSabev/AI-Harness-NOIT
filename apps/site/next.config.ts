import type { NextConfig } from "next";

// E9g B (D-377): a static export (out/), so the site can live on any static host and talks to no server of ours.
// trailingSlash: every page is <path>/index.html, which every static host serves. No sharp (D-284).
export const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  // two root layouts ((en) and (bg)/bg) → the 404 is app/global-not-found.tsx, which the Next docs mark experimental
  experimental: { globalNotFound: true },
};

export default config;
