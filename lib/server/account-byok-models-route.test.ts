import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const getActiveByokModelCatalog = vi.fn();
const getAuthedUser = vi.fn();

vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser }));
vi.mock("@/lib/server/agent/models-catalog", () => ({ getActiveByokModelCatalog }));

const { GET } = await import("@/app/api/account/byok-models/route");

describe("GET /api/account/byok-models", () => {
  beforeEach(() => {
    getAuthedUser.mockReset();
    getActiveByokModelCatalog.mockReset();
    getAuthedUser.mockResolvedValue({ ok: true, user: { id: "user-1" } });
  });

  it("loads the active provider catalog for the requested capability", async () => {
    getActiveByokModelCatalog.mockResolvedValue({
      provider: "openai",
      defaultModel: null,
      models: [{ id: "gpt-4o-mini-transcribe", name: "gpt-4o-mini-transcribe" }],
      recommended: [],
      maxMultiplier: null,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/account/byok-models?capability=transcription"),
    );

    expect(response.status).toBe(200);
    expect(getActiveByokModelCatalog).toHaveBeenCalledWith("user-1", "transcription");
    await expect(response.json()).resolves.toMatchObject({ provider: "openai" });
  });

  it("rejects an unknown model capability", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/account/byok-models?capability=image"),
    );

    expect(response.status).toBe(400);
    expect(getActiveByokModelCatalog).not.toHaveBeenCalled();
  });

  it("returns the authentication response unchanged", async () => {
    getAuthedUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await GET(new NextRequest("http://localhost/api/account/byok-models"));

    expect(response.status).toBe(401);
    expect(getActiveByokModelCatalog).not.toHaveBeenCalled();
  });
});
