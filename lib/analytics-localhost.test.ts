import { describe, expect, it } from "vitest";
import {
  isLocalAnalyticsHostname,
  shouldSendServerAnalytics,
} from "./analytics-localhost";

describe("isLocalAnalyticsHostname", () => {
  it("reconnaît les hôtes de développement", () => {
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
      "board.minddy.test", // domaines custom testés via /etc/hosts (MIN-36)
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
      // Un domaine qui CONTIENT localhost sans en être un.
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
    // Même en production, et même flag levé.
    expect(
      shouldSendServerAnalytics({ hasKey: false, appEnv: "production", allowLocalhost: true })
    ).toBe(false);
  });

  it("émet en production et en preview", () => {
    expect(shouldSendServerAnalytics({ ...base, appEnv: "production" })).toBe(true);
    expect(shouldSendServerAnalytics({ ...base, appEnv: "preview" })).toBe(true);
  });

  it("n'émet PAS depuis un dev local par défaut", () => {
    // La régression que ce garde-fou existe pour empêcher : un `pnpm dev` qui
    // écrit `issue_created_server` dans le projet de production.
    expect(shouldSendServerAnalytics({ ...base, appEnv: "development" })).toBe(false);
  });

  it("émet depuis le dev local si le flag est explicitement levé", () => {
    expect(
      shouldSendServerAnalytics({ hasKey: true, appEnv: "development", allowLocalhost: true })
    ).toBe(true);
  });
});
