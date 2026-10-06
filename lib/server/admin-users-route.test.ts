import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), admin: vi.fn(), lookup: vi.fn(), usage: vi.fn(), rpc: vi.fn(), internal: vi.fn(),
}));
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: mocks.auth }));
vi.mock("@/lib/server/admin", () => ({ isAdminUser: mocks.admin }));
vi.mock("@/lib/server/admin-users", () => ({ fetchAdminAccount: mocks.lookup, setUserInternal: mocks.internal }));
vi.mock("@/lib/server/usage", () => ({ getUserUsage: mocks.usage }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/server/billing-accounts", () => ({ activeAdminOverride: () => "pro" }));

const { GET, POST, PATCH } = await import("@/app/api/admin/users/route");
const userId = "11111111-1111-4111-8111-111111111111";
const account = { userId, name: "Support fixture", email: "support@example.test", internal: false, emailConfirmed: true };
const request = (method: string, body?: unknown, suffix = "") => new NextRequest(`https://minddy.app/api/admin/users${suffix}`, {
  method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, user: { id: "admin" }, claims: { aal: "aal2" } });
  mocks.admin.mockResolvedValue(true);
  mocks.lookup.mockResolvedValue(account);
  mocks.rpc.mockResolvedValue({ data: { total_cost: "12.5" }, error: null });
  mocks.usage.mockResolvedValue({
    usedUsd: 4, billing: {
      planId: "pro", source: "admin_override", plan: { includedUsageUsd: 20 },
      account: { admin_override_note: "Support credit", admin_override_expires_at: "2027-01-01T00:00:00Z", stripe_plan_id: "go", stripe_subscription_status: "active", email: "private@example.test", stripe_customer_id: "private-stripe-id" },
    },
  });
});

describe("admin support routes", () => {
  it("looks up a normalised exact address without reading billing or usage", async () => {
    const response = await POST(request("POST", { email: " SUPPORT@EXAMPLE.TEST " }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ account });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.lookup).toHaveBeenCalledWith({ email: "support@example.test" });
    expect(mocks.usage).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([null, {}, { email: "" }, { email: "support" }, { email: "%" }, { email: ["support@example.test"] }])("rejects directory or partial lookup input %j", async (body) => {
    expect((await POST(request("POST", body))).status).toBe(400);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("returns no account for an unknown address", async () => {
    mocks.lookup.mockResolvedValueOnce(null);
    expect(await (await POST(request("POST", { email: "missing@example.test" }))).json()).toEqual({ account: null });
  });

  it("reads only billing and quota details for a selected account", async () => {
    const response = await GET(request("GET", undefined, `?userId=${userId}`));
    const { user } = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.lookup).toHaveBeenCalledWith({ userId });
    expect(mocks.usage).toHaveBeenCalledWith(userId);
    expect(user).toEqual({ ...account, billing: {
      planId: "pro", source: "admin_override", override: "pro", overrideNote: "Support credit", overrideExpiresAt: "2027-01-01T00:00:00Z", stripePlanId: "go", stripeStatus: "active",
    }, usage: { budgetUsd: 20, spentUsd: 4, spentMonthUsd: 12.5, blocked: false } });
    expect(JSON.stringify(user)).not.toMatch(/private|onboarding|projects|issues|lastActivity|lastSignIn/);
  });

  it.each(["", "?search=support@example.test", "?userId=invalid"])("rejects the previous directory API %s", async (suffix) => {
    expect((await GET(request("GET", undefined, suffix))).status).toBe(400);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("does not calculate usage for a deleted or missing account", async () => {
    mocks.lookup.mockResolvedValueOnce(null);
    expect((await GET(request("GET", undefined, `?userId=${userId}`))).status).toBe(404);
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  it.each(["billing", "month", "lookup"])("does not fabricate balances after a %s failure", async (dependency) => {
    if (dependency === "billing") mocks.usage.mockRejectedValueOnce(new Error("Billing failed"));
    if (dependency === "month") mocks.rpc.mockResolvedValueOnce({ error: { message: "Unavailable" } });
    if (dependency === "lookup") mocks.lookup.mockRejectedValueOnce(new Error("Unavailable"));
    const response = await GET(request("GET", undefined, `?userId=${userId}`));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Query failed" });
  });

  it.each([GET, POST, PATCH])("rechecks admin authorization before any account operation", async (handler) => {
    mocks.admin.mockResolvedValueOnce(false);
    expect((await handler(request("POST", { email: account.email, userId, internal: true }))).status).toBe(403);
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.internal).not.toHaveBeenCalled();
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  it("preserves an authentication denial before the admin check", async () => {
    mocks.auth.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await POST(request("POST", { email: account.email }))).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
