import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  preference: {
    default_model: "anthropic/claude-sonnet-5",
    default_model_provider: "openrouter",
    default_reasoning_level: "high",
  } as Record<string, string | null> | null,
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
  getServiceClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({
          data: table === "user_agent_preferences" ? h.preference : h.byok,
        }),
      };
      return query;
    },
  }),
}));

vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValue: vi.fn(async () => "platform/fallback-must-not-run"),
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
  resolveAgentApiKeyForRun,
  resolveAgentModel,
  resolveReasoningLevel,
} from "./model";

const originalPlatformKey = process.env.OPENROUTER_API_KEY;

beforeEach(() => {
  h.preference = {
    default_model: "anthropic/claude-sonnet-5",
    default_model_provider: "openrouter",
    default_reasoning_level: "high",
  };
  h.byok = null;
  process.env.OPENROUTER_API_KEY = "platform-key";
});

afterAll(() => {
  if (originalPlatformKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalPlatformKey;
});

describe("account worker model resolution", () => {
  it("uses the explicit account model for platform workers", async () => {
    await expect(resolveAgentModel("user-1")).resolves.toEqual({
      model: "anthropic/claude-sonnet-5",
      provider: "openrouter",
      chosenByUser: true,
    });
  });

  it("uses the same provider-bound choice for BYOK workers", async () => {
    h.preference = {
      default_model: "claude-sonnet-5",
      default_model_provider: "anthropic",
      default_reasoning_level: "high",
    };
    h.byok = {
      provider: "anthropic",
      key_encrypted: "encrypted-key",
      base_url: null,
      validated_at: "2026-09-02T00:00:00.000Z",
      enabled_surfaces: ["agent"],
      feature_models: { agent_model: "ignored-second-source" },
    };

    await expect(resolveAgentModel("user-1")).resolves.toEqual({
      model: "claude-sonnet-5",
      provider: "anthropic",
      chosenByUser: true,
    });
  });

  it("fails closed after the active provider changes", async () => {
    h.byok = {
      provider: "openai",
      key_encrypted: "encrypted-key",
      base_url: null,
      validated_at: "2026-09-02T00:00:00.000Z",
      enabled_surfaces: ["agent"],
      feature_models: { agent_model: "gpt-autonomous-substitute" },
    };

    await expect(resolveAgentModel("user-1")).rejects.toMatchObject({
      code: "noModelForProvider",
      provider: "openai",
    });
  });

  it("fails closed when no account model is configured", async () => {
    h.preference = {
      default_model: null,
      default_model_provider: null,
      default_reasoning_level: "high",
    };

    await expect(resolveAgentModel("user-1")).rejects.toMatchObject({
      code: "noModelForProvider",
      provider: "openrouter",
    });
  });

  it("retains the account reasoning preference", async () => {
    await expect(resolveReasoningLevel("user-1")).resolves.toBe("high");
  });

  it("keeps a platform run on the platform after BYOK is added", async () => {
    h.byok = {
      provider: "openai",
      key_encrypted: "encrypted-key",
      base_url: null,
      validated_at: "2026-09-02T00:00:00.000Z",
      enabled_surfaces: ["agent"],
      feature_models: {},
    };

    await expect(
      resolveAgentApiKeyForRun("user-1", "agent", {
        keyMode: "platform",
        provider: "openrouter",
      }),
    ).resolves.toMatchObject({
      apiKey: "platform-key",
      mode: "platform",
      provider: "openrouter",
    });
  });

  it("refuses to resume a BYOK run on a replacement provider", async () => {
    h.byok = {
      provider: "openai",
      key_encrypted: "encrypted-key",
      base_url: null,
      validated_at: "2026-09-02T00:00:00.000Z",
      enabled_surfaces: ["agent"],
      feature_models: {},
    };

    await expect(
      resolveAgentApiKeyForRun("user-1", "agent", {
        keyMode: "byok",
        provider: "anthropic",
      }),
    ).rejects.toMatchObject({ code: "byokCredentialUnavailable" });
  });
});
