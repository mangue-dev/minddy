import { afterEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ readFailed: false }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ auth: { admin: {
  getUserById: async () => fixture.readFailed ? { data: {}, error: { message: "PRIVATE_AUTH_READ_SENTINEL" } }
    : { data: { user: { user_metadata: {} } }, error: null },
  updateUserById: async () => ({ error: { message: "PRIVATE_TAB_ORDER_UPDATE_SENTINEL" } }),
} } }) }));
const { setTabOrder } = await import("./tab-orders");
afterEach(() => { fixture.readFailed = false; vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("does not log private Auth error content while persisting tab preferences in production", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const result = await setTabOrder("synthetic-user", "global", ["synthetic-view"]);
  expect(result.ok).toBe(false); expect(log).toHaveBeenCalled();
  expect(log.mock.calls.flat().map(String).join()).not.toContain("PRIVATE_");
  expect(JSON.stringify(result)).not.toContain("PRIVATE_");
});
it("does not return private Auth lookup error content", async () => {
  vi.stubEnv("NODE_ENV", "production"); fixture.readFailed = true;
  expect(JSON.stringify(await setTabOrder("synthetic-user", "global", []))).not.toContain("PRIVATE_");
});
