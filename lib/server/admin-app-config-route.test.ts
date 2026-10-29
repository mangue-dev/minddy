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

vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser }));
vi.mock("@/lib/server/admin", () => ({ isAdminUser }));
vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues,
  setAppConfigValue,
  clearAppConfigValue,
}));
vi.mock("@/lib/server/decisions/model-validation", () => ({ validateDecisionModelChoice }));
vi.mock("@/lib/server/model-capability-validation", () => ({ validateCatalogCapabilityChoice }));

const { PATCH, POST } = await import("@/app/api/admin/app-config/route");
const { MODEL_CONFIG_FILE_FORMAT } = await import("@/lib/ai-model-config-file");

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
    await patch({ key: "smart_fill_model", value: "deepseek/deepseek-v4-flash" });
    expect(validateDecisionModelChoice).not.toHaveBeenCalled();
    expect(setAppConfigValue).toHaveBeenCalledWith("smart_fill_model", "deepseek/deepseek-v4-flash");
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

  it("does not check text fields such as the relation decision model", async () => {
    await patch({ key: "issue_relation_model", value: "deepseek/deepseek-v4-flash" });
    expect(validateCatalogCapabilityChoice).not.toHaveBeenCalled();
    expect(setAppConfigValue).toHaveBeenCalledWith("issue_relation_model", "deepseek/deepseek-v4-flash");
  });
});

describe("category defaults (MIN-829)", () => {
  it("releases the seeded task rows equal to their built-in default", async () => {
    getAppConfigValues.mockResolvedValue({
      smart_assign_model: "deepseek/deepseek-v4-flash",
      brief_model: "openai/gpt-5",
      smart_fill_model: "deepseek/deepseek-v4-flash",
      smart_fill_model_suffix: "nitro",
    });
    const response = await patch({ key: "category_automations_model", value: "openai/gpt-5-mini" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ released: ["smart_assign_model"] });
    expect(setAppConfigValue).toHaveBeenCalledWith("category_automations_model", "openai/gpt-5-mini");
    // A real override, and a default carrying its own shortcut, stay.
    expect(clearAppConfigValue).toHaveBeenCalledTimes(1);
    expect(clearAppConfigValue).toHaveBeenCalledWith("smart_assign_model");
  });

  it("checks an embedding category default against its catalog family", async () => {
    validateCatalogCapabilityChoice.mockResolvedValue({ ok: false, code: "capability_mismatch" });
    const response = await patch({ key: "category_embeddings_model", value: "deepseek/deepseek-v4-flash" });
    expect(response.status).toBe(400);
    expect(setAppConfigValue).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/app-config — import (MIN-829)", () => {
  const file = {
    format: MODEL_CONFIG_FILE_FORMAT,
    version: 1,
    tasks: { jev_model: { model: "liquid/d1" }, brief_model: { model: "openai/gpt-5" } },
  };
  const post = (body: unknown) =>
    POST(new NextRequest("http://localhost/api/admin/app-config", { method: "POST", body: JSON.stringify(body) }));

  it("forbids a non-admin", async () => {
    isAdminUser.mockResolvedValue(false);
    expect((await post({ file, apply: true })).status).toBe(403);
    expect(setAppConfigValue).not.toHaveBeenCalled();
  });

  it("previews the changes without writing", async () => {
    getAppConfigValues.mockResolvedValue({ smart_fill_model: "openai/gpt-5-mini" });
    const response = await post({ file, apply: false });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.applied).toBe(false);
    expect(body.changes).toEqual(
      expect.arrayContaining([
        { key: "smart_fill_model", from: "openai/gpt-5-mini", to: null },
        { key: "jev_model", from: null, to: "liquid/d1" },
      ]),
    );
    expect(setAppConfigValue).not.toHaveBeenCalled();
    expect(clearAppConfigValue).not.toHaveBeenCalled();
  });

  it("applies every change once all of them pass", async () => {
    getAppConfigValues.mockResolvedValue({ smart_fill_model: "openai/gpt-5-mini" });
    const response = await post({ file, apply: true });
    expect(response.status).toBe(200);
    expect(setAppConfigValue).toHaveBeenCalledWith("jev_model", "liquid/d1");
    expect(setAppConfigValue).toHaveBeenCalledWith("brief_model", "openai/gpt-5");
    expect(clearAppConfigValue).toHaveBeenCalledWith("smart_fill_model");
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
