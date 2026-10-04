import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { verifyOAuthAccessToken } from "./grants";
import { sha256Hex } from "./crypto";

const state = vi.hoisted(() => ({
  read: vi.fn(), rpc: vi.fn(), eq: vi.fn(), is: vi.fn(),
  jobs: [] as Array<() => Promise<void>>,
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => {
  const query = { select: () => query,
    eq: (...args: unknown[]) => { state.eq(...args); return query; },
    is: (...args: unknown[]) => { state.is(...args); return query; },
    maybeSingle: state.read };
  return { from: () => query, rpc: state.rpc };
} }));
vi.mock("@/lib/server/after-safe", () => ({
  afterOrNow: (job: () => Promise<void>) => state.jobs.push(job),
}));
const grant = () => ({ id: "grant", user_id: "user", api_key_id: "key",
  access_token_expires_at: "2026-10-04T12:01:00.000Z", api_keys: { revoked_at: null } });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T12:00:00.000Z"));
  state.read.mockReset(); state.rpc.mockReset(); state.eq.mockClear(); state.is.mockClear();
  state.jobs.length = 0;
  state.read.mockResolvedValue({ data: grant(), error: null });
  state.rpc.mockResolvedValue({ error: null });
});
afterEach(() => vi.useRealTimers());

it("checks the live token and schedules one RPC for both activity timestamps", async () => {
  await expect(verifyOAuthAccessToken("token")).resolves.toEqual({ userId: "user", keyId: "key" });
  expect(state.eq).toHaveBeenCalledWith("access_token_hash", sha256Hex("token"));
  expect(state.is).toHaveBeenCalledWith("revoked_at", null);
  expect(state.rpc).not.toHaveBeenCalled();
  expect(state.jobs).toHaveLength(1);
  await state.jobs[0]();
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith("touch_oauth_grant_activity", {
    p_grant_id: "grant", p_api_key_id: "key", p_used_at: "2026-10-04T12:00:00.000Z",
  });
});

it("rejects missing, revoked, expired and failed reads without scheduling writes", async () => {
  for (const data of [null, { ...grant(), api_keys: { revoked_at: "2026-10-04" } },
    { ...grant(), access_token_expires_at: "2026-10-04T12:00:00.000Z" },
    { ...grant(), access_token_expires_at: null }]) {
    state.read.mockResolvedValueOnce({ data, error: null });
    await expect(verifyOAuthAccessToken("token")).resolves.toBeNull();
  }
  state.read.mockResolvedValueOnce({ data: null, error: { message: "Unavailable" } });
  await expect(verifyOAuthAccessToken("token")).resolves.toBeNull();
  expect(state.jobs).toHaveLength(0);
  expect(state.rpc).not.toHaveBeenCalled();
});

it("rechecks revocation on every invocation and tolerates failed bookkeeping", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    state.rpc.mockResolvedValueOnce({ error: { message: "Unavailable" } });
    await expect(verifyOAuthAccessToken("token")).resolves.toEqual({ userId: "user", keyId: "key" });
    await state.jobs[0]();
    expect(log).toHaveBeenCalledWith("[oauth/grants] activity update:", "Unavailable");
    state.read.mockResolvedValueOnce({ data: null, error: null });
    await expect(verifyOAuthAccessToken("token")).resolves.toBeNull();
    expect(state.read).toHaveBeenCalledTimes(2);
    expect(state.jobs).toHaveLength(1);
  } finally { log.mockRestore(); }
});
