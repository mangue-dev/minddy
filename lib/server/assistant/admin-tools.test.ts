import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Numo's instance administration (MIN-829): only an administrator session
 * earns the tools, the session is re-verified before every call, and the
 * writes go through the same checks as the admin screen.
 */

const h = vi.hoisted(() => ({
  isAdminUser: vi.fn(),
  checkAiConfigValue: vi.fn(),
  writeAiConfigValue: vi.fn(),
  readAiConfigValues: vi.fn(),
  fetchAdminAccount: vi.fn(),
  fetchAdminUserDetails: vi.fn(),
  setAdminPlanOverride: vi.fn(),
  importAiConfigFile: vi.fn(),
  readAttachment: vi.fn(),
  getFinanceSummary: vi.fn(),
}));

vi.mock("@/lib/server/admin", async (original) => ({
  ...await original<typeof import("@/lib/server/admin")>(),
  isAdminUser: h.isAdminUser,
}));
vi.mock("@/lib/server/admin-model-config", () => ({
  checkAiConfigValue: h.checkAiConfigValue,
  writeAiConfigValue: h.writeAiConfigValue,
  readAiConfigValues: h.readAiConfigValues,
  importAiConfigFile: h.importAiConfigFile,
}));
vi.mock("@/lib/server/finance", () => ({ getFinanceSummary: h.getFinanceSummary }));
vi.mock("./conversation-attachments", () => ({ readConversationAttachmentText: h.readAttachment }));
vi.mock("@/lib/server/admin-users", () => ({
  fetchAdminAccount: h.fetchAdminAccount,
  fetchAdminUserDetails: h.fetchAdminUserDetails,
  setAdminPlanOverride: h.setAdminPlanOverride,
}));

const { adminGrantForRequest, executeAdminTool } = await import("./admin-tools");

const USER = "82900000-0000-4000-8000-000000000001";
const SESSION = "82900000-0000-4000-8000-000000000002";
const grant = { sessionId: SESSION, aal: "aal2" as const, amr: [{ method: "totp", timestamp: 1 }] };
const admin = { id: USER, email: "admin@example.test", app_metadata: { role: "admin" } };
const claims = { sub: USER, aal: "aal2", session_id: SESSION, amr: grant.amr };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_EMAILS", "");
  h.isAdminUser.mockResolvedValue(true);
  h.checkAiConfigValue.mockResolvedValue({ ok: true, value: "x" });
  h.writeAiConfigValue.mockImplementation(async (key: string, value: string) => ({ ok: true, key, value, released: [] }));
  h.fetchAdminAccount.mockResolvedValue({ userId: USER, name: "Support", email: "s@example.test", emailConfirmed: true });
});

describe("adminGrantForRequest", () => {
  it("grants the session an administrator chats from", async () => {
    await expect(adminGrantForRequest(admin, claims)).resolves.toEqual(grant);
    expect(h.isAdminUser).toHaveBeenCalledWith(admin, claims);
  });

  it("never runs the live lookup for a member who is not an administrator", async () => {
    const member = { id: USER, email: "member@example.test", app_metadata: {} };
    await expect(adminGrantForRequest(member, claims)).resolves.toBeNull();
    expect(h.isAdminUser).not.toHaveBeenCalled();
  });

  it("refuses a session without two-factor authentication", async () => {
    await expect(adminGrantForRequest(admin, { ...claims, aal: "aal1" })).resolves.toBeNull();
    expect(h.isAdminUser).not.toHaveBeenCalled();
  });

  it("refuses when the live check fails", async () => {
    h.isAdminUser.mockResolvedValue(false);
    await expect(adminGrantForRequest(admin, claims)).resolves.toBeNull();
  });
});

describe("executeAdminTool", () => {
  it("refuses without a grant, before reading anything", async () => {
    const result = await executeAdminTool("admin_get_account", { user_id: USER }, { userId: USER });
    expect(result.success).toBe(false);
    expect(h.isAdminUser).not.toHaveBeenCalled();
    expect(h.fetchAdminUserDetails).not.toHaveBeenCalled();
  });

  it("re-verifies the recorded session on every call", async () => {
    h.isAdminUser.mockResolvedValueOnce(false);
    const result = await executeAdminTool("admin_set_account_plan", { user_id: USER, plan_id: "pro" }, { userId: USER, adminGrant: grant });
    expect(result.success).toBe(false);
    expect(h.isAdminUser).toHaveBeenCalledWith(
      { id: USER },
      { sub: USER, aal: "aal2", session_id: SESSION, amr: grant.amr },
    );
    expect(h.setAdminPlanOverride).not.toHaveBeenCalled();
  });

  it("writes no model setting when one of them is refused", async () => {
    h.checkAiConfigValue
      .mockResolvedValueOnce({ ok: true, value: "openai/gpt-5-mini" })
      .mockResolvedValueOnce({ ok: false, status: 400, error: "Model is not a decision model" });
    const result = await executeAdminTool(
      "admin_update_instance_models",
      { changes: [{ key: "category_automations_model", value: "openai/gpt-5-mini" }, { key: "jev_model", value: "openai/gpt-5" }] },
      { userId: USER, adminGrant: grant },
    );
    expect(result.success).toBe(false);
    expect(h.writeAiConfigValue).not.toHaveBeenCalled();
  });

  it("applies checked model changes", async () => {
    const result = await executeAdminTool(
      "admin_update_instance_models",
      { changes: [{ key: "category_automations_model", value: "openai/gpt-5-mini" }] },
      { userId: USER, adminGrant: grant },
    );
    expect(result.success).toBe(true);
    expect(h.writeAiConfigValue).toHaveBeenCalledWith("category_automations_model", "openai/gpt-5-mini");
  });

  it("finds an account only by its complete address", async () => {
    const partial = await executeAdminTool("admin_find_account", { email: "support" }, { userId: USER, adminGrant: grant });
    expect(partial.success).toBe(false);
    expect(h.fetchAdminAccount).not.toHaveBeenCalled();
    await executeAdminTool("admin_find_account", { email: " S@Example.test " }, { userId: USER, adminGrant: grant });
    expect(h.fetchAdminAccount).toHaveBeenCalledWith({ email: "s@example.test" });
  });

  it("refuses an unknown plan or duration before writing", async () => {
    const plan = await executeAdminTool("admin_set_account_plan", { user_id: USER, plan_id: "enterprise" }, { userId: USER, adminGrant: grant });
    const duration = await executeAdminTool("admin_set_account_plan", { user_id: USER, plan_id: "pro", duration: "2w" }, { userId: USER, adminGrant: grant });
    expect(plan.success).toBe(false);
    expect(duration.success).toBe(false);
    expect(h.setAdminPlanOverride).not.toHaveBeenCalled();
  });

  it("imports the configuration file attached to the conversation, like the Import button", async () => {
    h.readAttachment.mockResolvedValue({ fileName: "models.json", text: '{"format":"minddy.instance-models","version":1}' });
    h.importAiConfigFile.mockResolvedValue({ ok: true, applied: false, changes: [], ignored: [], upgraded: false });
    const ctx = { userId: USER, adminGrant: grant, supabase: {}, service: {}, conversationId: "c1" } as never;
    const result = await executeAdminTool("admin_import_instance_models", { attachment_id: "m1:0", apply: false }, ctx);
    expect(result.success).toBe(true);
    expect(h.readAttachment).toHaveBeenCalledWith(ctx, "m1:0", expect.any(Number));
    expect(h.importAiConfigFile).toHaveBeenCalledWith('{"format":"minddy.instance-models","version":1}', false);
  });

  it("reads the costs like the Costs tab, filters and previous period included", async () => {
    const row = (day: string, feature: string, model: string, costUsd: number) => ({
      day, feature, model, costUsd, calls: 2, promptTokens: 100, completionTokens: 50, cachedTokens: 25,
    });
    h.getFinanceSummary.mockResolvedValue({
      windowDays: 2,
      windowStartDay: "2026-10-28",
      fetchedAt: "2026-10-29T12:00:00.000Z",
      breakdown: [
        row("2026-10-26", "numo_chat", "a/x", 1),
        row("2026-10-28", "numo_chat", "a/x", 3),
        row("2026-10-29", "smart_fill", "b/y", 1),
        row("2026-10-29", "numo_chat", "c/z", 5),
      ],
    });
    const result = await executeAdminTool("admin_get_costs", { days: 2, model: "a/x" }, { userId: USER, adminGrant: grant });
    expect(h.getFinanceSummary).toHaveBeenCalledWith({ days: 2 });
    expect(result.success).toBe(true);
    const costs = result.result as {
      totals: { spend_usd: number; requests: number };
      change_vs_previous: { spend: number };
      top_models: Array<{ model: string; spend_usd: number }>;
      by_family: Array<{ family: string; spend_usd: number }>;
      spend_per_day_usd: Array<{ day: string; spend: number }>;
    };
    // The other models are filtered out; the previous period held $1.
    expect(costs.totals).toMatchObject({ spend_usd: 3, requests: 2 });
    expect(costs.change_vs_previous.spend).toBe(2);
    expect(costs.top_models).toEqual([expect.objectContaining({ model: "a/x", spend_usd: 3 })]);
    expect(costs.by_family.map((entry) => entry.family)).toEqual(["numo"]);
    expect(costs.spend_per_day_usd).toEqual([{ day: "2026-10-28", spend: 3 }, { day: "2026-10-29", spend: 0 }]);
  });

  it("never reads the costs without a live administrator session", async () => {
    h.isAdminUser.mockResolvedValueOnce(false);
    const result = await executeAdminTool("admin_get_costs", {}, { userId: USER, adminGrant: grant });
    expect(result.success).toBe(false);
    expect(h.getFinanceSummary).not.toHaveBeenCalled();
  });

  it("gifts a plan through the support write", async () => {
    h.setAdminPlanOverride.mockResolvedValue({ userId: USER, planId: "pro" });
    const result = await executeAdminTool(
      "admin_set_account_plan",
      { user_id: USER, plan_id: "pro", duration: "1m", note: "Support credit" },
      { userId: USER, adminGrant: grant },
    );
    expect(result.success).toBe(true);
    expect(h.setAdminPlanOverride).toHaveBeenCalledWith({ userId: USER, planId: "pro", duration: "1m", note: "Support credit" });
  });
});
