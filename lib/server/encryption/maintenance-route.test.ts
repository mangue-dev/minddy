import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  enabled: false,
  configured: false,
  backfill: vi.fn(),
  rotate: vi.fn(),
  contentEnabled: false,
  scratchpads: vi.fn(),
  statistics: vi.fn(),
  history: vi.fn(),
}));

vi.mock("@/lib/server/encryption/invitation-email", () => ({
  isInvitationEncryptionEnabled: () => state.enabled,
  isInvitationEncryptionConfigured: () => state.configured,
}));
vi.mock("@/lib/server/encryption/invitation-backfill", () => ({
  backfillInvitationEmailsBatch: state.backfill,
}));
vi.mock("@/lib/server/encryption/rotation", () => ({ rotateDueContentKeys: state.rotate }));
vi.mock("@/lib/server/encryption/content-config", () => ({ isContentEncryptionEnabled: () => state.contentEnabled }));
vi.mock("@/lib/server/encryption/scratchpad-backfill", () => ({ backfillScratchpadsBatch: state.scratchpads }));
vi.mock("@/lib/server/encryption/stat-events-backfill", () => ({ backfillStatEventsBatch: state.statistics }));

vi.mock("@/lib/server/encryption/history-backfill", () => ({ backfillHistoryBatch: state.history }));

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
  state.contentEnabled = false;
  state.configured = false;
  state.backfill.mockReset();
  state.scratchpads.mockReset().mockResolvedValue({ scanned: 0, migrated: 0, unchanged: 0, conflicted: 0, failed: 0, interrupted: false });
  state.statistics.mockReset().mockResolvedValue({ scanned: 0, migrated: 0, unchanged: 0, conflicted: 0, failed: 0, interrupted: false });
  state.history.mockReset().mockResolvedValue({ scanned: 0, migrated: 0, unchanged: 0, conflicted: 0, failed: 0, interrupted: false });
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

  it("maintains personal content independently of the invitation flag", async () => {
    state.contentEnabled = true;
    state.configured = true;
    const response = await GET(request(true));
    expect(response.status).toBe(200);
    expect(state.scratchpads).toHaveBeenCalledWith(50, expect.any(AbortSignal));
    expect(state.statistics).toHaveBeenCalledWith(50, expect.any(AbortSignal));
    expect(state.history).toHaveBeenCalledWith("issue_events", 50, expect.any(AbortSignal));
    expect(state.history).toHaveBeenCalledWith("page_versions", 50, expect.any(AbortSignal));
    expect(state.backfill).not.toHaveBeenCalled();
    expect(state.rotate).toHaveBeenCalled();
  });

  it("reports a failed or interrupted statistics migration to the scheduler", async () => {
    state.contentEnabled = true;
    state.configured = true;
    state.statistics.mockResolvedValue({ scanned: 1, migrated: 0, unchanged: 0, conflicted: 0, failed: 1, interrupted: false });
    expect((await GET(request(true))).status).toBe(503);
    state.statistics.mockResolvedValue({ scanned: 0, migrated: 0, unchanged: 0, conflicted: 0, failed: 0, interrupted: true });
    expect((await GET(request(true))).status).toBe(503);
  });

  it("reports partial failure without exposing provider details or blocking other repositories", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      state.contentEnabled = true;
      state.enabled = true;
      state.configured = true;
      state.backfill.mockRejectedValue(new Error("Private provider error"));
      const response = await GET(request(true));
      expect(response.status).toBe(503);
      expect(state.scratchpads).toHaveBeenCalled();
      const output = JSON.stringify(await response.json());
      expect(output).toContain("invitation_failed");
      expect(output).not.toContain("Private provider error");
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain("Private provider error");
    } finally { errorLog.mockRestore(); }
  });
  it("reports a failed history batch while still migrating other histories", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      state.contentEnabled = true;
      state.configured = true;
      state.history.mockRejectedValueOnce(new Error("Private history error"));
      const response = await GET(request(true));
      expect(response.status).toBe(503);
      expect(state.history).toHaveBeenCalledTimes(2);
      expect(await response.json()).toMatchObject({ activity: { failed: true }, page_versions: { failed: 0 } });
      expect(JSON.stringify(log.mock.calls)).not.toContain("Private history error");
    } finally { log.mockRestore(); }
  });

});
