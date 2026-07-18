import { describe, expect, it } from "vitest";
import { sanitizeInternalRedirectPath } from "./auth-redirect";

describe("sanitizeInternalRedirectPath", () => {
  it("keeps a safe internal path", () => {
    expect(sanitizeInternalRedirectPath("/home")).toBe("/home");
    expect(sanitizeInternalRedirectPath("/projects/42?issue=7")).toBe(
      "/projects/42?issue=7"
    );
    expect(sanitizeInternalRedirectPath("%2Fprojects%2F42")).toBe("/projects/42");
  });

  it("collapses the root redirector to the fallback", () => {
    // '/' only server-redirects to /home; used as a post-login target it traps
    // users on /login (its logged-out redirect is prefetched into the router
    // cache), so it must resolve to a real route.
    expect(sanitizeInternalRedirectPath("/")).toBe("/home");
    expect(sanitizeInternalRedirectPath("%2F")).toBe("/home");
    expect(sanitizeInternalRedirectPath("/?foo=bar")).toBe("/home");
  });

  it("falls back for empty or missing input", () => {
    expect(sanitizeInternalRedirectPath(null)).toBe("/home");
    expect(sanitizeInternalRedirectPath(undefined)).toBe("/home");
    expect(sanitizeInternalRedirectPath("")).toBe("/home");
    expect(sanitizeInternalRedirectPath("   ")).toBe("/home");
  });

  it("rejects anything that could escape the app", () => {
    expect(sanitizeInternalRedirectPath("https://evil.com")).toBe("/home");
    expect(sanitizeInternalRedirectPath("//evil.com")).toBe("/home");
    expect(sanitizeInternalRedirectPath("/\\evil.com")).toBe("/home");
    expect(sanitizeInternalRedirectPath("/x:something")).toBe("/home");
    expect(sanitizeInternalRedirectPath("relative/path")).toBe("/home");
  });

  it("honours a custom fallback", () => {
    expect(sanitizeInternalRedirectPath("/", "/dashboard")).toBe("/dashboard");
    expect(sanitizeInternalRedirectPath(null, "/dashboard")).toBe("/dashboard");
  });
});
