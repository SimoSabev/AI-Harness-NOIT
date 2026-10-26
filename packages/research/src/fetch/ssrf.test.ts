import { describe, expect, it } from "vitest";
import { checkUrl, isPublicAddress } from "./ssrf.js";

describe("SSRF guard (AC-13.6)", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "198.18.0.1", "255.255.255.255"])("v4 %s is private", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
  it.each(["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::a00:1", "2001:db8::1", "2002:c0a8:101::1"])("v6 %s is private", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("%s is public", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
  it("names and garbage are not addresses", () => {
    expect(isPublicAddress("example.org")).toBe(false);
  });
  it("URL checks: scheme, credentials, port, internal names, literal private addresses", () => {
    expect(checkUrl("https://example.org/a").ok).toBe(true);
    expect(checkUrl("http://example.org:8080/a").ok).toBe(true);
    expect(checkUrl("file:///etc/passwd")).toEqual({ ok: false, why: "only http(s)" });
    expect(checkUrl("https://u:p@example.org/")).toEqual({ ok: false, why: "credentials in the URL" });
    expect(checkUrl("https://example.org:22/")).toEqual({ ok: false, why: "port 22" });
    expect(checkUrl("http://localhost/")).toEqual({ ok: false, why: "internal host name" });
    expect(checkUrl("http://printer.local/")).toEqual({ ok: false, why: "internal host name" });
    expect(checkUrl("http://intranet/")).toEqual({ ok: false, why: "internal host name" });
    expect(checkUrl("http://169.254.169.254/latest/meta-data")).toEqual({ ok: false, why: "private address" });
    expect(checkUrl("http://[::1]/")).toEqual({ ok: false, why: "private address" });
    expect(checkUrl("http://0x7f.0.0.1/").ok).toBe(false);
  });
});
