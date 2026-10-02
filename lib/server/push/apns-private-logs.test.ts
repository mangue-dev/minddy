import { afterEach, expect, it, vi } from "vitest";
vi.mock("node:crypto", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:crypto")>(),
  createPrivateKey: () => { throw new Error("MIN591_PRIVATE_APNS_SENTINEL"); },
}));
import { apnsProviderToken } from "./apns";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("does not log a private APNs key parsing exception in production", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APNS_TEAM_ID", "synthetic");
  vi.stubEnv("APNS_KEY_ID", "synthetic");
  vi.stubEnv("APNS_BUNDLE_ID", "com.example.synthetic");
  vi.stubEnv("APNS_PRIVATE_KEY", "synthetic-private-key");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(apnsProviderToken()).toBeNull();
  expect(log).toHaveBeenCalled();
  expect(log.mock.calls.flat().map(String).join("\n")).not.toContain("MIN591_PRIVATE_APNS_SENTINEL");
});
