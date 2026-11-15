import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const { default: nextConfig, COOP_SOURCE } = await import("../next.config.mjs");
// The matcher Next itself compiles `headers()` sources with.
const { pathToRegexp } = createRequire(import.meta.url)("next/dist/compiled/path-to-regexp") as {
  pathToRegexp: (source: string) => RegExp;
};

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

async function rule(match: (source: string) => boolean): Promise<HeaderRule> {
  const configured = (await nextConfig.headers!()) as HeaderRule[];
  const found = configured.find((entry) => match(entry.source));
  if (!found) throw new Error("header rule not found");
  return found;
}

const header = (entry: HeaderRule, key: string) =>
  entry.headers.find((h) => h.key === key)?.value;

describe("security headers", () => {
  it("blocks plugin content and foreign framing on app routes", async () => {
    const catchAll = await rule((source) => source.includes("oauth/authorize(?:/?$)"));
    const csp = header(catchAll, "Content-Security-Policy") ?? "";
    expect(csp).toContain("object-src 'none'");
    // `'self'`, not `'none'`: the blob PDF preview inherits this policy and
    // WebKit would refuse to show it inside the page.
    expect(csp).toContain("frame-ancestors 'self'");
    expect(header(catchAll, "X-Frame-Options")).toBe("SAMEORIGIN");
    // COOP lives in its own rule, which skips the sign-in chain.
    expect(header(catchAll, "Cross-Origin-Opener-Policy")).toBeUndefined();
  });

  it("keeps the same baseline on the OAuth consent screen", async () => {
    const consent = await rule((source) => source === "/oauth/authorize");
    const csp = header(consent, "Content-Security-Policy") ?? "";
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("form-action");
    expect(header(consent, "Cross-Origin-Opener-Policy")).toBeUndefined();
  });

  it("isolates the opener everywhere except the sign-in chain an OAuth popup walks", async () => {
    const coop = await rule((source) => source === COOP_SOURCE);
    expect(header(coop, "Cross-Origin-Opener-Policy")).toBe("same-origin-allow-popups");

    const matches = pathToRegexp(COOP_SOURCE);
    for (const path of ["/", "/home", "/projects/min-3f2a9c81", "/settings/account", "/pricing", "/loginx", "/authors", "/api/issues"]) {
      expect(matches.test(path), path).toBe(true);
    }
    for (const path of [
      "/oauth/authorize",
      "/oauth/success",
      "/login",
      "/signup",
      "/forgot-password",
      "/reset-password",
      "/auth/callback",
      "/auth/confirm/complete",
      "/api/oauth/authorize",
      "/api/auth/lookup",
    ]) {
      expect(matches.test(path), path).toBe(false);
    }
  });
});
