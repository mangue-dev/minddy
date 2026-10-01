import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  billing: vi.fn(),
  quotaReset: vi.fn(),
  rpc: vi.fn(),
  byok: vi.fn(),
  managed: vi.fn(),
}));

vi.mock("@/lib/server/billing-accounts", () => ({
  getResolvedBilling: h.billing,
  shouldUseStripePlan: (status: string) => status === "active",
}));
vi.mock("@/lib/server/ai-runtime", () => ({ usesByokForSurface: h.byok }));
vi.mock("@/lib/managed-services", () => ({ isManagedAiEnabled: h.managed }));
vi.mock("@/lib/server/ai-usage", () => ({ recordAiUsage: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: h.rpc,
    from: (table: string) => {
      expect(table).toBe("agent_quota_resets");
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        maybeSingle: h.quotaReset,
      };
      return query;
    },
  }),
}));

import { ensureUsageBudget, getUserUsage } from "./usage";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function billing(account: Record<string, string> | null = null) {
  return { account, plan: { includedUsageUsd: 10 } };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  h.billing.mockReset().mockResolvedValue(billing());
  h.quotaReset.mockReset().mockResolvedValue({ data: null });
  h.rpc.mockReset().mockResolvedValue({ data: { total_cost: 10, by_feature: [] }, error: null });
  h.byok.mockReset().mockResolvedValue(false);
  h.managed.mockReset().mockReturnValue(true);
});

afterEach(() => vi.useRealTimers());

describe("usage admission independent reads", () => {
  it("starts the quota-reset query while billing is still pending", async () => {
    const billingRead = deferred<ReturnType<typeof billing>>();
    h.billing.mockReturnValue(billingRead.promise);
    h.quotaReset.mockResolvedValue({ data: { reset_at: "2026-10-01T06:00:00Z" } });
    h.rpc.mockResolvedValue({
      data: { total_cost: "1.2345678", by_feature: [{ feature: "assistant", cost: "0.1234567" }] },
      error: null,
    });
    const read = getUserUsage("user-1");
    const resetStartedBeforeBilling = h.quotaReset.mock.calls.length;
    expect(h.rpc).not.toHaveBeenCalled();
    billingRead.resolve(billing());
    await expect(read).resolves.toMatchObject({
      period: { start: "2026-10-01T06:00:00Z", end: "2026-11-01T00:00:00.000Z" },
      usedUsd: 1.234568,
      byFeature: { assistant: 0.123457 },
    });
    expect(resetStartedBeforeBilling).toBe(1);
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith("get_user_usage_since", {
      p_user_id: "user-1", p_since: "2026-10-01T06:00:00Z",
    });
  });

  it("starts BYOK lookup while the usage ledger read is still pending and retains quota denial", async () => {
    const ledger = deferred<{ data: { total_cost: number }; error: null }>();
    h.rpc.mockReturnValue(ledger.promise);
    const admission = ensureUsageBudget("user-1", "assistant", "assistant_model");
    const outcome = expect(admission).rejects.toMatchObject({
      status: 403, code: "usage_budget_exceeded", params: { used: 10, included: 10 },
    });
    await vi.waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(1));
    const byokStartedBeforeLedger = h.byok.mock.calls.length;
    ledger.resolve({ data: { total_cost: 10 }, error: null });
    await outcome;
    expect(byokStartedBeforeLedger).toBe(1);
    expect(h.byok).toHaveBeenCalledExactlyOnceWith("user-1", "assistant", "assistant_model");
  });

  it("retains the BYOK exemption for an exhausted managed budget", async () => {
    h.byok.mockResolvedValue(true);
    await expect(ensureUsageBudget("user-1", "assistant", "assistant_model")).resolves.toMatchObject({ usedUsd: 10 });
  });

  it("does not consult BYOK or enforce a managed quota on unmanaged AI", async () => {
    h.managed.mockReturnValue(false);
    await expect(ensureUsageBudget("user-1", "assistant", "assistant_model")).resolves.toMatchObject({ usedUsd: 10 });
    expect(h.byok).not.toHaveBeenCalled();
  });

  it.each([undefined, "assistant"] as const)("retains denial without a complete BYOK requirement: %s", async (surface) => {
    await expect(ensureUsageBudget("user-1", surface)).rejects.toMatchObject({ code: "usage_budget_exceeded" });
    expect(h.byok).not.toHaveBeenCalled();
  });

  it("retains ledger failure precedence when the independent BYOK read fails earlier", async () => {
    const ledger = deferred<{ data: null; error: { message: string } }>();
    h.rpc.mockReturnValue(ledger.promise);
    h.byok.mockRejectedValue(new Error("BYOK unavailable"));
    const admission = ensureUsageBudget("user-1", "assistant", "assistant_model");
    const outcome = expect(admission).rejects.toThrow("Ledger unavailable");
    await vi.waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(1));
    ledger.resolve({ data: null, error: { message: "Ledger unavailable" } });
    await outcome;
  });

  it("propagates a BYOK lookup failure when usage was read successfully", async () => {
    h.byok.mockRejectedValue(new Error("BYOK unavailable"));
    await expect(ensureUsageBudget("user-1", "assistant", "assistant_model")).rejects.toThrow("BYOK unavailable");
  });

  it.each([
    ["2026-09-15T00:00:00Z", "2027-09-15T00:00:00Z", "2026-10-01T06:00:00Z", "2026-10-01T06:00:00Z", "2026-10-15T00:00:00.000Z"],
    ["2026-09-15T00:00:00Z", "2027-09-15T00:00:00Z", "2026-09-01T00:00:00Z", "2026-09-15T00:00:00.000Z", "2026-10-15T00:00:00.000Z"],
    ["2026-09-20T00:00:00Z", "2026-10-20T00:00:00Z", null, "2026-09-20T00:00:00Z", "2026-10-20T00:00:00Z"],
  ])("preserves the subscription window and watermark for %s through %s", async (start, end, resetAt, expectedStart, expectedEnd) => {
    h.billing.mockResolvedValue(billing({
      stripe_subscription_status: "active",
      stripe_current_period_start: start,
      stripe_current_period_end: end,
    }));
    h.quotaReset.mockResolvedValue({ data: resetAt ? { reset_at: resetAt } : null });
    await expect(getUserUsage("user-1")).resolves.toMatchObject({ period: { start: expectedStart, end: expectedEnd } });
    expect(h.rpc).toHaveBeenCalledWith("get_user_usage_since", { p_user_id: "user-1", p_since: expectedStart });
  });
});
