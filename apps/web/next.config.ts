import type { NextConfig } from "next";

// D-284: no sharp; D-285: workspace packages are built JS (dist), pg/typescript stay external on the server.
export const config: NextConfig = {
  poweredByHeader: false,
  images: { unoptimized: true },
  serverExternalPackages: ["pg", "typescript"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // D-581: Jarvis (D-556) listens through this page's microphone; this origin only, no camera, no location
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
