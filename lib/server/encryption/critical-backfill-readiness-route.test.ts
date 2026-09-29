import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authorized: false,
  verify: vi.fn(),
  forge: vi.fn(),
}));
vi.mock("@/lib/server/cron-auth", () => ({
  verifyCronSecret: () => mocks.authorized,
}));
vi.mock("@/lib/server/encryption/critical-backfill-readiness", () => ({
  verifyCriticalBackfillReadiness: mocks.verify,
}));
vi.mock("@/lib/server/encryption/forge-attachment-readiness", () => ({ verifyForgeAttachmentReadiness: mocks.forge }));
const { GET } = await import("@/app/api/cron/encryption-readiness/route");
const request = () => new NextRequest("https://staging.invalid/api/cron/encryption-readiness");

beforeEach(() => {
  mocks.authorized = false;
  mocks.verify.mockReset();
  mocks.forge.mockReset().mockResolvedValue({ scope: "forge_attachment_objects", ready: true, scanned: 0, blocked: 0 });
});

describe("encryption readiness route", () => {
  it("rejects requests without the cron secret before touching data", async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("returns only readiness counts and rejects blocked rows", async () => {
    mocks.authorized = true;
    mocks.verify.mockResolvedValue({ ready: false, scanned: { pullRequests: 1 },
      blocked: { pullRequests: 1 } });
    const response = await GET(request());
    expect(response.status).toBe(409);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ ready: false, globalReadiness: "not_assessed",
      critical: { scanned: { pullRequests: 1 }, blocked: { pullRequests: 1 } } });
  });

  it("returns success after a complete authenticated scan", async () => {
    mocks.authorized = true;
    mocks.verify.mockResolvedValue({ ready: true, scanned: { pullRequests: 1 },
      blocked: { pullRequests: 0 } });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ready: true });
  });

  it("does not expose verification errors", async () => {
    mocks.authorized = true;
    mocks.verify.mockRejectedValue(new Error("Private ciphertext fragment"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("Private ciphertext fragment");
  });
  it("cannot certify missing forge bytes from ten passing SQL families", async () => {
    mocks.authorized = true;
    mocks.verify.mockResolvedValue({ ready: true });
    mocks.forge.mockResolvedValue({ ready: false, scanned: 1, blocked: 1 });
    const response = await GET(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ready: false, globalReadiness: "not_assessed" });
  });
});
