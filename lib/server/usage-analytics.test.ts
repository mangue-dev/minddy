import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  managed: true,
  auth: true,
  rpc: vi.fn(),
  billing: vi.fn(),
  period: vi.fn(),
}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () =>
    mocks.auth
      ? { ok: true, user: { id: "account-1" } }
      : {
          ok: false,
          response: Response.json({ error: "Unauthorized" }, { status: 401 }),
        },
}));
vi.mock("@/lib/server/billing-accounts", () => ({
  getResolvedBilling: mocks.billing,
}));
vi.mock("@/lib/server/usage", () => ({ getUsagePeriod: mocks.period }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/managed-services", () => ({
  isManagedAiEnabled: () => mocks.managed,
}));
const { GET } = await import("@/app/api/billing/usage-analytics/route");

describe("authenticated usage analytics", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T10:00:00Z"));
    mocks.managed = true;
    mocks.auth = true;
    mocks.billing.mockResolvedValue({ plan: { includedUsageUsd: 15 } });
    mocks.period.mockResolvedValue({
      start: "2026-09-10T12:00:00Z",
      end: "2026-10-10T12:00:00Z",
    });
    mocks.rpc.mockResolvedValue({
      data: [{ day: "2026-09-10", feature: "numo_chat", cost: ".5" }],
      error: null,
    });
  });

  it("uses the authenticated account and its effective reset window", async () => {
    const response = await GET(
      new NextRequest(
        "https://minddy.app/api/billing/usage-analytics?user_id=another-account",
      ),
    );
    expect(mocks.billing).toHaveBeenCalledWith("account-1");
    expect(mocks.rpc).toHaveBeenCalledWith("get_user_usage_daily", {
      p_user_id: "account-1",
      p_since: "2026-09-10T12:00:00Z",
      p_until: "2026-09-12T10:00:00.000Z",
    });
    expect(await response.json()).toMatchObject({
      includedUsd: 15,
      days: [{ day: "2026-09-10", usd: 0.5 }, { usd: 0 }, { usd: 0 }],
    });
  });

  it("does not query the ledger when managed AI is disabled", async () => {
    mocks.managed = false;
    const response = await GET(
      new NextRequest("https://minddy.app/api/billing/usage-analytics"),
    );
    expect(await response.json()).toMatchObject({ includedUsd: 0, days: [] });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests before reading billing", async () => {
    mocks.auth = false;
    expect(
      (
        await GET(
          new NextRequest("https://minddy.app/api/billing/usage-analytics"),
        )
      ).status,
    ).toBe(401);
    expect(mocks.billing).not.toHaveBeenCalled();
  });

  it("returns a retryable error instead of fabricated zero usage", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "RPC unavailable" },
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      (
        await GET(
          new NextRequest("https://minddy.app/api/billing/usage-analytics"),
        )
      ).status,
    ).toBe(500);
    error.mockRestore();
  });
});
