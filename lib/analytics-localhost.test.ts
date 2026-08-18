import { describe, expect, it } from "vitest";
import {
  isLocalAnalyticsHostname,
  shouldSendServerAnalytics,
} from "./analytics-localhost";

describe("isLocalAnalyticsHostname", () => {
  it("recognizes development hosts", () => {
    for (const host of [
      "localhost",
      "LOCALHOST",
      " localhost ",
      "127.0.0.1",
      "0.0.0.0",
      "::1",
      "[::1]", // forme rendue par location.hostname en IPv6
      "app.localhost",
      "minddy.test",
      "board.minddy.test", // custom domains tested via /etc/hosts (MIN-36)
    ]) {
      expect(isLocalAnalyticsHostname(host), host).toBe(true);
    }
  });

  it("laisse passer la production et les previews", () => {
    for (const host of [
      "www.minddy.app",
      "minddy.app",
      "preview.minddy.app",
      "minddy-abc123.vercel.app",
      "feedback.client.com",
      // A domain that CONTAINS localhost without being one.
      "notlocalhost.com",
    ]) {
      expect(isLocalAnalyticsHostname(host), host).toBe(false);
    }
  });
});

describe("shouldSendServerAnalytics", () => {
  const base = { hasKey: true, appEnv: "production", allowLocalhost: false };

  it("n'émet jamais sans clé", () => {
    expect(shouldSendServerAnalytics({ ...base, hasKey: false })).toBe(false);
    // Even in production, and same flag raised.
    expect(
      shouldSendServerAnalytics({ hasKey: false, appEnv: "production", allowLocalhost: true })
    ).toBe(false);
  });

  it("emits in production and preview", () => {
    expect(shouldSendServerAnalytics({ ...base, appEnv: "production" })).toBe(true);
    expect(shouldSendServerAnalytics({ ...base, appEnv: "preview" })).toBe(true);
  });

  it("n'émet PAS depuis un dev local par défaut", () => {
    // The regression that this safeguard exists to prevent: a `pnpm dev` which
    // writes `issue_created_server` in the production project.
    expect(shouldSendServerAnalytics({ ...base, appEnv: "development" })).toBe(false);
  });

  it("emits from local development when the flag is explicitly enabled", () => {
    expect(
      shouldSendServerAnalytics({ hasKey: true, appEnv: "development", allowLocalhost: true })
    ).toBe(true);
  });
});
