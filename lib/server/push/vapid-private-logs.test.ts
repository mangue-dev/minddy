import { afterEach, expect, it, vi } from "vitest";
vi.mock("web-push", () => ({ default: {
  setVapidDetails: () => { throw new Error("MIN591_PRIVATE_VAPID_SENTINEL"); },
} }));
import { configureWebPush, isPushConfigured } from "./vapid";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it.each(["subject", "key"])("does not log private VAPID %s configuration in production", (failure) => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("MINDDY_PUBLIC_VAPID_PUBLIC_KEY", "synthetic");
  vi.stubEnv("VAPID_PRIVATE_KEY", "synthetic");
  vi.stubEnv("VAPID_SUBJECT", failure === "subject" ? "MIN591_PRIVATE_VAPID_SENTINEL" : "mailto:synthetic@example.test");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(failure === "subject" ? isPushConfigured() : configureWebPush()).toBe(false);
  expect(log).toHaveBeenCalled();
  expect(log.mock.calls.flat().map(String).join("\n")).not.toContain("MIN591_PRIVATE_VAPID_SENTINEL");
});
