import { describe, expect, it } from "vitest";
import { publishedPort } from "./pg-container.test-helper.js";

// D-389: the Docker tests' Postgres is reached on 127.0.0.1 (a container IP is not reachable from a Mac).
describe("publishedPort (D-389)", () => {
  it("the 127.0.0.1 line of `docker port`; nothing else counts", () => {
    expect(publishedPort("127.0.0.1:55012\n[::1]:55012\n")).toBe(55012);
    expect(publishedPort("0.0.0.0:55012\n")).toBeNull();
    expect(publishedPort("")).toBeNull();
  });
});
