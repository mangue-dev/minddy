import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const getAuthedUser = vi.fn();
const getDecisionSettings = vi.fn();
const updateDecisionSettings = vi.fn();
const captureServerException = vi.fn();

class DecisionSettingsError extends Error {
  constructor(message: string, readonly code: string, readonly status = 422) {
    super(message);
  }
}

vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser }));
vi.mock("@/lib/server/error-tracking", () => ({ captureServerException }));
vi.mock("@/lib/server/decisions/engine", () => ({
  DecisionSettingsError,
  getDecisionSettings,
  updateDecisionSettings,
}));

const { GET, PUT } = await import("@/app/api/account/ai-decisions/route");

const put = (body: unknown) => PUT(new NextRequest("http://localhost/api/account/ai-decisions", {
  method: "PUT",
  body: JSON.stringify(body),
}));

describe("/api/account/ai-decisions (MIN-980)", () => {
  beforeEach(() => {
    getAuthedUser.mockReset().mockResolvedValue({ ok: true, user: { id: "user-1" } });
    getDecisionSettings.mockReset().mockResolvedValue({ engine: null });
    updateDecisionSettings.mockReset().mockResolvedValue({ engine: "llm" });
    captureServerException.mockReset();
  });

  it("returns the account's settings", async () => {
    const response = await GET(new NextRequest("http://localhost/api/account/ai-decisions"));
    expect(response.status).toBe(200);
    expect(getDecisionSettings).toHaveBeenCalledWith("user-1");
  });

  it("passes only the fields sent, null included", async () => {
    const response = await put({ engine: "llm", provider: null });
    expect(response.status).toBe(200);
    expect(updateDecisionSettings).toHaveBeenCalledWith("user-1", { engine: "llm", provider: null });
  });

  it("refuses an unknown engine, provider or an empty change before any write", async () => {
    for (const body of [{ engine: "oracle" }, { provider: "acme" }, { model: 42 }, {}, ["llm"]]) {
      expect((await put(body)).status).toBe(400);
    }
    expect(updateDecisionSettings).not.toHaveBeenCalled();
  });

  it("returns a refused choice with its code", async () => {
    updateDecisionSettings.mockRejectedValue(
      new DecisionSettingsError("This model is not a decision model.", "not_a_decision_model", 400),
    );
    const response = await put({ model: "openai/gpt-5" });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "not_a_decision_model" });
    expect(captureServerException).not.toHaveBeenCalled();
  });
});
