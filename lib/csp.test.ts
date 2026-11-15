import { describe, expect, it } from "vitest";
import { createCspNonce, isCdnCachedDocument, reportOnlyScriptPolicy } from "@/lib/csp";

describe("report-only script policy", () => {
  it("draws a fresh, unguessable nonce for each request", () => {
    const nonces = new Set(Array.from({ length: 50 }, createCspNonce));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("trusts the nonce, reports Trusted Types sinks, and allows eval only in development", () => {
    const policy = reportOnlyScriptPolicy("abc");
    expect(policy).toContain("script-src 'nonce-abc' 'strict-dynamic'");
    expect(policy).toContain("require-trusted-types-for 'script'");
    expect(policy).toContain("report-to csp");
    expect(policy).not.toContain("unsafe-eval");
    expect(reportOnlyScriptPolicy("abc", { dev: true })).toContain("'unsafe-eval'");
  });
});

describe("CDN-cached documents", () => {
  it("matches the cached public pages and documentation articles only", () => {
    for (const path of ["/", "/pricing", "/fr/tarifs", "/docs", "/fr/documentation/numo"]) {
      expect(isCdnCachedDocument(path), path).toBe(true);
    }
    for (const path of ["/home", "/login", "/f/tok", "/docs/numo/extra", "/pricingx"]) {
      expect(isCdnCachedDocument(path), path).toBe(false);
    }
  });

  it("leaves script-src out of the policy without a nonce", () => {
    const policy = reportOnlyScriptPolicy(null);
    expect(policy).not.toContain("script-src");
    expect(policy).toContain("require-trusted-types-for 'script'");
  });
});
