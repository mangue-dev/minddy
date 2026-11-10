import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The admin save of the global decision model (MIN-694): only an admin can
 * write it, a choice the decision gate refuses is never stored, and clearing
 * back to the registry default needs no check.
 */

vi.mock("server-only", () => ({}));

const {
  getAuthedUser,
  getAppConfigValues,
  isAdminUser,
  setAppConfigValue,
  clearAppConfigValue,
  validateDecisionModelChoice,
  validateCatalogCapabilityChoice,
} = vi.hoisted(() => ({
  validateCatalogCapabilityChoice: vi.fn(),
  getAppConfigValues: vi.fn(),
  getAuthedUser: vi.fn(),
  isAdminUser: vi.fn(),
  setAppConfigValue: vi.fn(),
  clearAppConfigValue: vi.fn(),
  validateDecisionModelChoice: vi.fn(),
}));

// `getAuthedAdmin` is `getAuthedUser` followed by `isAdminUser`; its single
// authorization lookup is covered by admin.test.ts.
vi.mock("@/lib/server/admin", () => ({
  getAuthedAdmin: async (request: unknown) => {
    const auth = await getAuthedUser(request);
    if (!auth.ok) return auth;
    if (!(await isAdminUser(auth.user, auth.claims))) {
      const { NextResponse } = await import("next/server");
      return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    return auth;
  },
}));
vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues,
  setAppConfigValue,
  clearAppConfigValue,
}));
vi.mock("@/lib/server/decisions/model-validation", () => ({ validateDecisionModelChoice }));
vi.mock("@/lib/server/model-capability-validation", () => ({ validateCatalogCapabilityChoice }));

const { GET, PATCH, POST } = await import("@/app/api/admin/app-config/route");
const { MODEL_CONFIG_FILE_FORMAT, MODEL_CONFIG_FILE_VERSION } = await import("@/lib/ai-model-config-file");

function patch(body: unknown) {
  return PATCH(
    new NextRequest("http://localhost/api/admin/app-config", {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  getAuthedUser.mockReset().mockResolvedValue({ ok: true, user: { id: "admin-1" }, claims: {} });
  getAppConfigValues.mockReset().mockResolvedValue({});
  isAdminUser.mockReset().mockResolvedValue(true);
  setAppConfigValue.mockReset().mockResolvedValue(undefined);
  clearAppConfigValue.mockReset().mockResolvedValue(undefined);
  validateDecisionModelChoice.mockReset().mockResolvedValue({ ok: true });
  validateCatalogCapabilityChoice.mockReset().mockResolvedValue({ ok: true, verified: true });
});

describe("PATCH /api/admin/app-config — decision model", () => {
  it("forbids a non-admin, even through a direct API call", async () => {
    isAdminUser.mockResolvedValue(false);
    const response = await patch({ key: "jev_model", value: "liquid/d1" });
    expect(response.status).toBe(403);
    expect(validateDecisionModelChoice).not.toHaveBeenCalled();
    expect(setAppConfigValue).not.toHaveBeenCalled();
  });

  it("stores a decision model the gate accepts", async () => {
    const response = await patch({ key: "jev_model", value: " liquid/d1 " });
    expect(response.status).toBe(200);
    expect(validateDecisionModelChoice).toHaveBeenCalledWith("liquid/d1");
    expect(setAppConfigValue).toHaveBeenCalledWith("jev_model", "liquid/d1");
  });

  it.each([
    [400, "not_a_decision_model", undefined],
    [422, "compatibility_check_failed", "timeout"],
    [503, "catalog_unavailable", undefined],
  ] as const)("refuses with %i %s and writes nothing", async (status, code, reason) => {
    validateDecisionModelChoice.mockResolvedValue({ ok: false, status, code, reason });
    const response = await patch({ key: "jev_model", value: "openai/gpt-6" });
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({
      code,
      ...(reason ? { reason } : {}),
    });
    expect(setAppConfigValue).not.toHaveBeenCalled();
    expect(clearAppConfigValue).not.toHaveBeenCalled();
  });

  it("clears back to the default without probing anything", async () => {
    const response = await patch({ key: "jev_model", value: "" });
    expect(response.status).toBe(200);
    expect(validateDecisionModelChoice).not.toHaveBeenCalled();
    expect(clearAppConfigValue).toHaveBeenCalledWith("jev_model");
  });

  it("does not run the decision gate on other model settings", async () => {
    await patch({ key: "assistant_model", value: "deepseek/deepseek-v4-flash" });
    expect(validateDecisionModelChoice).not.toHaveBeenCalled();
    expect(setAppConfigValue).toHaveBeenCalledWith("assistant_model", "deepseek/deepseek-v4-flash");
  });
});

describe("PATCH /api/admin/app-config — background turns per day (MIN-929)", () => {
  it("stores a whole number and refuses anything else", async () => {
    expect((await patch({ key: "numo_wake_daily_limit", value: " 05 " })).status).toBe(200);
    expect(setAppConfigValue).toHaveBeenCalledWith("numo_wake_daily_limit", "5");
    for (const value of ["-1", "2.5", "many", "501"]) {
      expect((await patch({ key: "numo_wake_daily_limit", value })).status).toBe(400);
    }
    expect(setAppConfigValue).toHaveBeenCalledTimes(1);
  });

  it("reads back for the dashboard", async () => {
    getAppConfigValues.mockResolvedValue({ numo_wake_daily_limit: "5" });
    const response = await GET(new NextRequest("http://localhost/api/admin/app-config"));
    expect(getAppConfigValues.mock.calls[0][0]).toContain("numo_wake_daily_limit");
    await expect(response.json()).resolves.toMatchObject({ values: { numo_wake_daily_limit: "5" } });
  });

  it("is neither exported nor reset by a models file", async () => {
    const { MODEL_CONFIG_FILE_KEYS } = await import("@/lib/ai-model-config-file");
    expect(MODEL_CONFIG_FILE_KEYS).not.toContain("numo_wake_daily_limit");
  });
});

describe("PATCH /api/admin/app-config — embedding models (MIN-717)", () => {
  it("stores an issue embedding model that matches its capability", async () => {
    const response = await patch({ key: "issue_embedding_model", value: "openai/text-embedding-3-large" });
    expect(response.status).toBe(200);
    expect(validateCatalogCapabilityChoice).toHaveBeenCalledWith("openai/text-embedding-3-large", "embedding");
    expect(setAppConfigValue).toHaveBeenCalledWith("issue_embedding_model", "openai/text-embedding-3-large");
  });

  it("refuses a chat model in the embedding field and writes nothing", async () => {
    validateCatalogCapabilityChoice.mockResolvedValue({ ok: false, code: "capability_mismatch" });
    const response = await patch({ key: "issue_embedding_model", value: "deepseek/deepseek-v4-flash" });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "capability_mismatch" });
    expect(setAppConfigValue).not.toHaveBeenCalled();
  });

  it("does not check the language model against an embedding catalog", async () => {
    await patch({ key: "assistant_model", value: "deepseek/deepseek-v4-flash" });
    expect(validateCatalogCapabilityChoice).not.toHaveBeenCalled();
    expect(setAppConfigValue).toHaveBeenCalledWith("assistant_model", "deepseek/deepseek-v4-flash");
  });
});

describe("one model per role (MIN-954)", () => {
  it("reads a role still on its retired category default as that model", async () => {
    getAppConfigValues.mockResolvedValue({ category_assistant_model: "openai/gpt-5-mini" });
    const response = await GET(new NextRequest("http://localhost/api/admin/app-config"));
    const { values } = await response.json();
    expect(values).toMatchObject({ assistant_model: "openai/gpt-5-mini" });
    expect(values).not.toHaveProperty("category_assistant_model");
  });

  it("refuses a per-task, category, shortcut or recommended-models key", async () => {
    for (const key of ["smart_fill_model", "category_automations_model", "assistant_model_suffix", "recommended_models"]) {
      expect((await patch({ key, value: "openai/gpt-5-mini" })).status).toBe(400);
    }
    expect(setAppConfigValue).not.toHaveBeenCalled();
  });

  it("clears a role's retired category row, so the role runs what was set", async () => {
    expect((await patch({ key: "assistant_model", value: "openai/gpt-5-mini" })).status).toBe(200);
    expect(setAppConfigValue).toHaveBeenCalledWith("assistant_model", "openai/gpt-5-mini");
    expect(clearAppConfigValue).toHaveBeenCalledWith("category_assistant_model");
    expect(clearAppConfigValue).toHaveBeenCalledWith("category_assistant_model_suffix");
    // The routing shortcut is no longer set from the dashboard: it is cleared too.
    expect(clearAppConfigValue).toHaveBeenCalledWith("assistant_model_suffix");
  });
});

describe("POST /api/admin/app-config — import (MIN-829)", () => {
  const file = {
    format: MODEL_CONFIG_FILE_FORMAT,
    version: MODEL_CONFIG_FILE_VERSION,
    tasks: { jev_model: { model: "liquid/d1" }, assistant_model: { model: "openai/gpt-5" } },
  };
  const post = (body: unknown) =>
    POST(new NextRequest("http://localhost/api/admin/app-config", { method: "POST", body: JSON.stringify(body) }));

  it("forbids a non-admin", async () => {
    isAdminUser.mockResolvedValue(false);
    expect((await post({ file, apply: true })).status).toBe(403);
    expect(setAppConfigValue).not.toHaveBeenCalled();
  });

  it("previews the changes without writing", async () => {
    getAppConfigValues.mockResolvedValue({ transcription_model: "openai/whisper-large-v3" });
    const response = await post({ file, apply: false });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.applied).toBe(false);
    expect(body.changes).toEqual(
      expect.arrayContaining([
        { key: "transcription_model", from: "openai/whisper-large-v3", to: null },
        { key: "jev_model", from: null, to: "liquid/d1" },
      ]),
    );
    expect(setAppConfigValue).not.toHaveBeenCalled();
    expect(clearAppConfigValue).not.toHaveBeenCalled();
  });

  it("applies every change once all of them pass", async () => {
    getAppConfigValues.mockResolvedValue({ transcription_model: "openai/whisper-large-v3" });
    const response = await post({ file, apply: true });
    expect(response.status).toBe(200);
    expect(setAppConfigValue).toHaveBeenCalledWith("jev_model", "liquid/d1");
    expect(setAppConfigValue).toHaveBeenCalledWith("assistant_model", "openai/gpt-5");
    expect(clearAppConfigValue).toHaveBeenCalledWith("transcription_model");
  });

  it("writes nothing when one value is refused", async () => {
    validateDecisionModelChoice.mockResolvedValue({ ok: false, status: 400, code: "not_a_decision_model" });
    const response = await post({ file, apply: true });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "refused", key: "jev_model" });
    expect(setAppConfigValue).not.toHaveBeenCalled();
    expect(clearAppConfigValue).not.toHaveBeenCalled();
  });

  it("refuses a file from a newer release", async () => {
    const response = await post({ file: { ...file, version: 99 }, apply: true });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "newer_version" });
  });
});
