import { describe, expect, it } from "vitest";
import { config } from "../next.config.js";

// The security headers of every page (D-284). D-581: Jarvis (D-556) listens through the microphone of this page, so the
// Permissions-Policy allows the microphone for this origin only; the camera and location stay off.
describe("the web's security headers", () => {
  it("every page: nosniff, same-origin referrer, no framing; the microphone for this origin only, no camera, no location", async () => {
    const rules = (await config.headers?.()) ?? [];
    const all = rules.find((r) => r.source === "/:path*")?.headers ?? [];
    const h = Object.fromEntries(all.map((x) => [x.key, x.value]));
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("same-origin");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Permissions-Policy"]).toBe("camera=(), microphone=(self), geolocation=()");
  });
});
