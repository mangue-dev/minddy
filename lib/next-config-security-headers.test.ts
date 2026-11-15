import { describe, expect, it } from "vitest";

const { default: nextConfig } = await import("../next.config.mjs");

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
  it("blocks plugin content on app routes", async () => {
    const catchAll = await rule((source) => source.includes("oauth/authorize(?:/?$)"));
    expect(header(catchAll, "Content-Security-Policy")).toContain("object-src 'none'");
    // No COOP: web MCP clients run OAuth in a popup and need `window.opener`.
    expect(header(catchAll, "Cross-Origin-Opener-Policy")).toBeUndefined();
  });

  it("keeps the same baseline on the OAuth consent screen", async () => {
    const consent = await rule((source) => source === "/oauth/authorize");
    const csp = header(consent, "Content-Security-Policy") ?? "";
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("form-action");
    expect(header(consent, "Cross-Origin-Opener-Policy")).toBeUndefined();
  });
});
