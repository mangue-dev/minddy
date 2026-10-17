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
  isAdminUser,
  setAppConfigValue,
  clearAppConfigValue,
  validateDecisionModelChoice,
  validateCatalogCapabilityChoice,
} = vi.hoisted(() => ({
  validateCatalogCapabilityChoice: vi.fn(),
  getAuthedUser: vi.fn(),
  isAdminUser: vi.fn(),
  setAppConfigValue: vi.fn(),
  clearAppConfigValue: vi.fn(),
  validateDecisionModelChoice: vi.fn(),
}));

vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser }));
vi.mock("@/lib/server/admin", () => ({ isAdminUser }));
vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues: vi.fn(async () => ({})),
  setAppConfigValue,
  clearAppConfigValue,
}));
vi.mock("@/lib/server/decisions/model-validation", () => ({ validateDecisionModelChoice }));
vi.mock("@/lib/server/model-capability-validation", () => ({ validateCatalogCapabilityChoice }));

const { PATCH } = await import("@/app/api/admin/app-config/route");

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
