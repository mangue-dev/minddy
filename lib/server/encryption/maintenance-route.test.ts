import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  enabled: false,
  configured: false,
  backfill: vi.fn(),
  rotate: vi.fn(),
}));

vi.mock("@/lib/server/encryption/invitation-email", () => ({
  isInvitationEncryptionEnabled: () => state.enabled,
  isInvitationEncryptionConfigured: () => state.configured,
}));
vi.mock("@/lib/server/encryption/invitation-backfill", () => ({
  backfillInvitationEmailsBatch: state.backfill,
}));
vi.mock("@/lib/server/encryption/rotation", () => ({ rotateDueContentKeys: state.rotate }));

const { GET } = await import("@/app/api/cron/encryption-maintenance/route");
const secret = "x".repeat(32);

function request(authorized: boolean): NextRequest {
  return new NextRequest("http://localhost/api/cron/encryption-maintenance", {
    headers: authorized ? { authorization: `Bearer ${secret}` } : {},
  });
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", secret);
  state.enabled = false;
  state.configured = false;
  state.backfill.mockReset();
  state.rotate.mockReset().mockResolvedValue({ scanned: 0, advanced: 0, failed: 0 });
});

afterEach(() => vi.unstubAllEnvs());

describe("encryption maintenance cron", () => {
  it("requires cron authorization", async () => {
    expect((await GET(request(false))).status).toBe(401);
    expect(state.backfill).not.toHaveBeenCalled();
    expect(state.rotate).not.toHaveBeenCalled();
  });

  it("does not touch data while encryption is disabled", async () => {
    const response = await GET(request(true));
    expect(await response.json()).toEqual({ skipped: true });
    expect(state.backfill).not.toHaveBeenCalled();
  });

  it("reports missing KMS configuration without running the backfill", async () => {
    state.enabled = true;
    const response = await GET(request(true));
    expect(response.status).toBe(503);
    expect(state.backfill).not.toHaveBeenCalled();
  });

  it("runs one bounded batch when explicitly enabled", async () => {
    state.enabled = true;
    state.configured = true;
    state.backfill.mockResolvedValue({ scanned: 1, encrypted: 1, purged: 0 });
    const response = await GET(request(true));
    expect(await response.json()).toEqual({
      scanned: 1, encrypted: 1, purged: 0, rotation: { scanned: 0, advanced: 0, failed: 0 },
    });
    expect(state.backfill).toHaveBeenCalledWith(100);
  });

  it("signals rotation failures to the scheduler while continuing the migration batch", async () => {
    state.enabled = true;
    state.configured = true;
    state.rotate.mockResolvedValue({ scanned: 2, advanced: 1, failed: 1 });
    state.backfill.mockResolvedValue({ scanned: 0, encrypted: 0, purged: 0 });
    expect((await GET(request(true))).status).toBe(503);
    expect(state.backfill).toHaveBeenCalledWith(100);
  });
});
