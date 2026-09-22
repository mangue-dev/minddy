import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  enabled: false,
  configured: false,
  backfill: vi.fn(),
}));

vi.mock("@/lib/server/encryption/invitation-email", () => ({
  isInvitationEncryptionEnabled: () => state.enabled,
  isInvitationEncryptionConfigured: () => state.configured,
}));
vi.mock("@/lib/server/encryption/invitation-backfill", () => ({
  backfillInvitationEmailsBatch: state.backfill,
}));

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
});

afterEach(() => vi.unstubAllEnvs());

describe("encryption maintenance cron", () => {
  it("requires cron authorization", async () => {
    expect((await GET(request(false))).status).toBe(401);
    expect(state.backfill).not.toHaveBeenCalled();
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
    expect(await response.json()).toEqual({ scanned: 1, encrypted: 1, purged: 0 });
    expect(state.backfill).toHaveBeenCalledWith(100);
  });
});
