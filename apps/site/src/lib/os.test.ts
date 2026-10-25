import { describe, expect, it } from "vitest";
import { detectOs } from "./os";

// E9g B (D-377): "Download for <your OS>" — the browser's own hints, nothing sent anywhere.
describe("detectOs (E9g B)", () => {
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
  it("desktop systems", () => {
    expect(detectOs({ userAgent: mac, maxTouchPoints: 0 })).toBe("mac");
    expect(detectOs({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36" })).toBe("windows");
    expect(detectOs({ userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36" })).toBe("linux");
    expect(detectOs({ userAgent: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0" })).toBe("linux");
  });
  it("phones and tablets go to the PWA, including an iPad that says it is a Mac", () => {
    expect(detectOs({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" })).toBe("phone");
    expect(detectOs({ userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36" })).toBe("phone");
    expect(detectOs({ userAgent: mac, maxTouchPoints: 5 })).toBe("phone");
  });
  it("User-Agent Client Hints win when present", () => {
    expect(detectOs({ userAgent: "Mozilla/5.0", platform: "macOS" })).toBe("mac");
    expect(detectOs({ userAgent: "Mozilla/5.0", platform: "Windows" })).toBe("windows");
    expect(detectOs({ userAgent: "Mozilla/5.0", platform: "Linux" })).toBe("linux");
    expect(detectOs({ userAgent: "Mozilla/5.0", platform: "Android", mobile: true })).toBe("phone");
    expect(detectOs({ userAgent: "Mozilla/5.0", platform: "Chrome OS" })).toBe("unknown");
  });
  it("anything else is unknown", () => {
    expect(detectOs({ userAgent: "" })).toBe("unknown");
    expect(detectOs({ userAgent: "curl/8.7.1" })).toBe("unknown");
  });
});
