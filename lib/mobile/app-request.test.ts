import { describe, expect, it } from "vitest";
import { isMarketingRouteKey, isMobileAppUserAgent } from "./app-request";

describe("isMobileAppUserAgent", () => {
  it("recognizes the agent the iOS shell appends", () => {
    expect(isMobileAppUserAgent("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 minddy-mobile/1.4.0")).toBe(true);
  });

  it("leaves browsers and the desktop app alone", () => {
    expect(isMobileAppUserAgent("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Safari/604.1")).toBe(false);
    expect(isMobileAppUserAgent("Mozilla/5.0 (Macintosh) minddy-desktop/0.40.0")).toBe(false);
    expect(isMobileAppUserAgent(null)).toBe(false);
  });
});

describe("isMarketingRouteKey", () => {
  it("covers the landing, pricing and the other selling pages", () => {
    for (const key of ["home", "pricing", "mcp", "download", "changelog", "alternativeLinear", "selfHosting"]) {
      expect(isMarketingRouteKey(key)).toBe(true);
    }
  });

  it("keeps the legal texts and the documentation", () => {
    for (const key of ["legal", "terms", "privacy", "cookies", "documentation"]) {
      expect(isMarketingRouteKey(key)).toBe(false);
    }
    expect(isMarketingRouteKey(undefined)).toBe(false);
  });
});
