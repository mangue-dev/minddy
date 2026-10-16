import { beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ rpc: vi.fn(), result: { data: null as unknown, error: null as unknown } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: (...args: unknown[]) => {
      h.rpc(...args);
      return { abortSignal: async () => h.result };
    },
  }),
}));

import { listAuthSessions } from "./auth-sessions";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

beforeEach(() => {
  h.rpc.mockClear();
  h.result = { data: null, error: null };
});

it("reduces each live session to a device name and marks the caller's own", async () => {
  h.result.data = [
    { id: "s-current", created_at: "2026-10-01T09:00:00Z", last_active_at: "2026-10-16T08:00:00Z", user_agent: CHROME_MAC, ip: "203.0.113.4" },
    { id: "s-other", created_at: "2026-09-01T09:00:00Z", last_active_at: "2026-10-10T08:00:00Z", user_agent: null },
  ];

  const sessions = await listAuthSessions("owner", "s-current");

  expect(h.rpc).toHaveBeenCalledWith("list_auth_sessions", { p_user: "owner" });
  expect(sessions).toEqual([
    { id: "s-current", current: true, browser: "Chrome", platform: "macOS", created_at: "2026-10-01T09:00:00Z", last_active_at: "2026-10-16T08:00:00Z" },
    { id: "s-other", current: false, browser: null, platform: null, created_at: "2026-09-01T09:00:00Z", last_active_at: "2026-10-10T08:00:00Z" },
  ]);
});

it("fails without exposing the database error", async () => {
  h.result.error = { message: "permission denied for table sessions" };
  await expect(listAuthSessions("owner", "s-current")).rejects.toThrow("auth_sessions_lookup_failed");
});
