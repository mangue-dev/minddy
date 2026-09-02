import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  config: {} as Record<string, string | null>,
  byok: null as {
    provider: string;
    key_encrypted: string;
    base_url: string | null;
    validated_at: string;
    enabled_surfaces: string[];
    feature_models: Record<string, string>;
  } | null,
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({ data: h.byok }),
    };
    return { from: () => query };
  },
}));

vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValue: vi.fn(async (key: string) => h.config[key] ?? null),
}));

vi.mock("./byok-credentials", () => ({
  decryptUserAiKey: vi.fn(() => "user-key"),
  LOCAL_ENDPOINT_WITHOUT_API_KEY: "__local_endpoint_without_api_key__",
}));

vi.mock("@/lib/server/safe-fetch", () => ({
  assertPublicHttpUrl: vi.fn(async () => {}),
}));

vi.mock("@/lib/managed-services", () => ({ isManagedAiEnabled: () => true }));

import {
  getPrReviewDefaultModelForUser,
  resolvePrReviewModel,
} from "./model";

function byok(
  provider: string,
  featureModels: Record<string, string> = {},
) {
  h.byok = {
    provider,
    key_encrypted: "encrypted-key",
    base_url: provider === "generic" ? "https://llm.example.com/v1" : null,
    validated_at: "2026-09-02T00:00:00.000Z",
    enabled_surfaces: ["agent"],
    feature_models: featureModels,
  };
}

beforeEach(() => {
  h.config = { pr_review_model: "anthropic/platform-review" };
  h.byok = null;
});

describe("PR review defaults", () => {
  it("uses the instance model for platform execution", async () => {
    await expect(getPrReviewDefaultModelForUser("user-1")).resolves.toBe(
      "anthropic/platform-review",
    );
  });

  it("uses the account's feature model for native BYOK", async () => {
    byok("anthropic", { pr_review_model: "claude-account-review" });

    await expect(getPrReviewDefaultModelForUser("user-1")).resolves.toBe(
      "claude-account-review",
    );
  });

  it("uses the provider-specific admin default for native BYOK", async () => {
    byok("openai");
    h.config.byok_default_openai_pr_review_model = "gpt-admin-review";

    await expect(getPrReviewDefaultModelForUser("user-1")).resolves.toBe(
      "gpt-admin-review",
    );
  });

  it("requires an explicit model when a generic provider has no default", async () => {
    byok("generic");

    await expect(getPrReviewDefaultModelForUser("user-1")).resolves.toBeNull();
    await expect(
      resolvePrReviewModel({ userId: "user-1", ignoreRemembered: true }),
    ).rejects.toMatchObject({ code: "noModelForProvider", provider: "generic" });
  });
});
