import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const edition = process.env.MINDDY_TEST_EDITION;
const byok = process.env.MINDDY_TEST_BYOK === "1";
const expectBilling = process.env.MINDDY_TEST_EXPECT_BILLING === "1";
const expectAi = process.env.MINDDY_TEST_EXPECT_AI === "1";

const getResolvedBilling = vi.fn(async (userId: string) => ({
  plan: {
    id: "free",
    allowAgents: userId !== "entitlement-user-id",
    includedUsageUsd: 0,
    maxProjects: 0,
    maxIssuesPerProject: 0,
    maxMembersPerProject: 0,
  },
}));
const getUserUsage = vi.fn(async () => ({
  usedUsd: 0,
  byFeature: {},
  period: { start: "2026-08-01T00:00:00.000Z", end: "2026-09-01T00:00:00.000Z" },
}));

vi.mock("@/lib/server/billing-accounts", () => ({
  getResolvedBilling,
  upsertBillingAccount: vi.fn(),
  findUserIdForStripeIdentifiers: vi.fn(),
  syncSubscriptionToBillingAccount: vi.fn(),
}));
vi.mock("@/lib/server/usage", () => ({
  getUserUsage,
  hasUsageBudget: vi.fn(async () => false),
}));
vi.mock("@/lib/server/agent/model", () => ({
  getUserByok: vi.fn(async () => byok
    ? {
        provider: "openrouter",
        apiKey: "fake-operator-byok-key",
        baseUrl: "https://openrouter.ai/api/v1",
        featureModels: {},
      }
    : null),
  userHasByokKey: vi.fn(async () => byok),
  resolveProviderDefaultModel: vi.fn(async () => null),
}));
vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues: vi.fn(async (keys: string[]) =>
    Object.fromEntries(keys.map((key) => [key, "fake/model"])),
  ),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
      })),
    })),
  })),
}));
vi.mock("@/lib/server/posthog", () => ({
  captureServerEvent: vi.fn(),
  identifyServerUser: vi.fn(),
}));

const { resolveCapabilities } = await import("@/lib/capabilities");
const { managedServices } = await import("@/lib/managed-services");
const { ensureAgentsAllowed } = await import("@/lib/server/entitlements");
const { isStripeConfigured } = await import("@/lib/server/stripe");
const { POST: stripeWebhook } = await import("@/app/api/stripe/webhook/route");
const { resolveAiRuntime } = await import("@/lib/server/ai-runtime");
const { checkAgentQuota } = await import("@/lib/server/agent/quota");

const matrix = edition ? describe : describe.skip;

matrix(`edition matrix: ${edition ?? "no fixture"}`, () => {
  it("résout les services et annonce clairement les capacités partielles", () => {
    expect(managedServices()).toEqual({ billing: expectBilling, ai: expectAi });

    const capabilities = resolveCapabilities(process.env);
    expect(capabilities.managedBilling.configured).toBe(expectBilling);
    expect(capabilities.managedAi.configured).toBe(expectAi);

    const partial = process.env.MINDDY_TEST_PARTIAL;
    if (partial === "billing") {
      expect(capabilities.managedBilling).toMatchObject({ state: "incomplete" });
      expect(capabilities.managedBilling.missing).toContain("STRIPE_WEBHOOK_SECRET");
    }
    if (partial === "ai") {
      expect(capabilities.managedAi).toMatchObject({
        state: "incomplete",
        missing: ["OPENROUTER_API_KEY"],
      });
    }
  });

  it("applique les gardes de plan uniquement au billing Cloud", async () => {
    getResolvedBilling.mockClear();
    if (expectBilling) {
      await expect(ensureAgentsAllowed("entitlement-user-id")).rejects.toMatchObject({
        name: "PlanLimitError",
      });
      expect(getResolvedBilling).toHaveBeenCalledWith("entitlement-user-id");
    } else {
      await expect(ensureAgentsAllowed("entitlement-user-id")).resolves.toBeUndefined();
      expect(getResolvedBilling).not.toHaveBeenCalled();
    }
  });

  it("active Stripe et son webhook uniquement avec la configuration Cloud complète", async () => {
    expect(isStripeConfigured()).toBe(expectBilling);
    const response = await stripeWebhook(new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "invalid" },
    }) as Parameters<typeof stripeWebhook>[0]);
    // 400 signifie que le webhook actif a contrôlé la signature ; 503 qu'il est indisponible.
    expect(response.status).toBe(expectBilling ? 400 : 503);
  });

  it("choisit le bon payeur IA sans repli vers la clé plateforme", async () => {
    const runtime = resolveAiRuntime({ userId: "fake-user-id", modelKey: "assistant_model" });
    if (byok) {
      await expect(runtime).resolves.toMatchObject({
        mode: "byok",
        apiKey: "fake-operator-byok-key",
      });
    } else if (expectAi) {
      await expect(runtime).resolves.toMatchObject({
        mode: "platform",
        apiKey: "fake-minddy-platform-key",
      });
    } else {
      await expect(runtime).rejects.toMatchObject({ name: "ManagedAiUnavailableError" });
    }
  });

  it("ne lit le plan et le quota minddy que pour l'IA Cloud", async () => {
    getResolvedBilling.mockClear();
    getUserUsage.mockClear();
    const quota = await checkAgentQuota("quota-user-id");

    if (byok) {
      expect(quota).toMatchObject({ allowed: true, unlimited: true, mode: "byok" });
      expect(getResolvedBilling).not.toHaveBeenCalled();
      expect(getUserUsage).not.toHaveBeenCalled();
    } else if (expectAi) {
      expect(quota).toMatchObject({
        allowed: false,
        mode: "platform",
        reason: "usage_budget_exceeded",
      });
      expect(getResolvedBilling).toHaveBeenCalledWith("quota-user-id");
      expect(getUserUsage).toHaveBeenCalledWith("quota-user-id");
    } else {
      expect(quota).toMatchObject({
        allowed: false,
        reason: "managed_ai_unavailable",
      });
      expect(getResolvedBilling).not.toHaveBeenCalled();
      expect(getUserUsage).not.toHaveBeenCalled();
    }
  });
});
