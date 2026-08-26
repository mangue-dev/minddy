import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeQuery, setFakeTable } from "../../test/forge-relay/fake-supabase";

const reserveProviderOperation = vi.fn();
const addDomainToVercel = vi.fn();
const getVercelDomainState = vi.fn();
const removeDomainFromVercel = vi.fn();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (name: string) => new FakeQuery(name) }),
}));
vi.mock("@/lib/server/provider-operation-guard", () => ({ reserveProviderOperation }));
vi.mock("@/lib/server/vercel-domains", () => ({
  addDomainToVercel,
  getVercelDomainState,
  removeDomainFromVercel,
  VERCEL_CNAME_TARGET: "cname.vercel-dns.com",
}));
vi.mock("@/lib/custom-domain-lookup", () => ({
  invalidateCustomDomainCache: vi.fn(),
  lookupCustomDomain: vi.fn(),
}));
vi.mock("@/lib/public-hosts", () => ({
  customDomainAllowlist: () => new Set<string>(),
  isPrimaryHost: () => true,
  normalizeHost: (host: string) => host,
}));
vi.mock("@/lib/site", () => ({ SITE_URL: "https://www.minddy.app" }));

const {
  detachDomainFromVercelOnly,
  refreshDomainStatus,
  removeDomain,
  serializeDomainStatus,
  setDomain,
} = await import("./custom-domains");

const ACTOR = "11111111-1111-4111-8111-111111111111";
const ROW = {
  id: "domain-1",
  domain: "feedback.example.com",
  board_id: "board-1",
  share_id: null,
  status: "pending" as const,
  verification: null,
  cname_target: null,
  created_at: "2026-08-26T00:00:00.000Z",
  updated_at: "2026-08-26T00:00:00.000Z",
};

beforeEach(() => {
  reserveProviderOperation.mockReset();
  addDomainToVercel.mockReset();
  getVercelDomainState.mockReset();
  removeDomainFromVercel.mockReset();
  setFakeTable("custom_domains", []);
});

describe("custom-domain provider admission", () => {
  it("returns cached state when another instance holds the refresh lease", async () => {
    reserveProviderOperation.mockResolvedValue({ state: "deduplicated", retryAfter: 9 });

    await expect(refreshDomainStatus(ROW, ACTOR)).resolves.toEqual({
      ok: true,
      domain: serializeDomainStatus(ROW),
      refreshed: false,
    });
    expect(getVercelDomainState).not.toHaveBeenCalled();
  });

  it("rejects quota-exhausted mutations before any provider operation", async () => {
    reserveProviderOperation.mockResolvedValue({ state: "quota_exceeded", retryAfter: 12 });

    await expect(setDomain({ boardId: "board-1" }, ROW.domain, ACTOR)).resolves.toEqual({
      ok: false,
      error: "rate_limited",
      retryAfter: 12,
    });
    expect(addDomainToVercel).not.toHaveBeenCalled();
    expect(removeDomainFromVercel).not.toHaveBeenCalled();
  });

  it("fails closed when shared admission is unavailable", async () => {
    reserveProviderOperation.mockResolvedValue({ state: "unavailable", retryAfter: 0 });

    await expect(removeDomain(ROW, ACTOR)).resolves.toEqual({
      ok: false,
      error: "provider_unavailable",
    });
    expect(removeDomainFromVercel).not.toHaveBeenCalled();
  });

  it("allows only the reserved side of a parallel refresh decision to call Vercel", async () => {
    reserveProviderOperation
      .mockResolvedValueOnce({ state: "reserved", retryAfter: 0 })
      .mockResolvedValueOnce({ state: "deduplicated", retryAfter: 15 });
    getVercelDomainState.mockResolvedValue({
      attached: true,
      verified: false,
      misconfigured: true,
      verification: [],
      cnameTarget: null,
    });

    const results = await Promise.all([
      refreshDomainStatus(ROW, ACTOR),
      refreshDomainStatus(ROW, "22222222-2222-4222-8222-222222222222"),
    ]);

    expect(results.every((result) => result.ok)).toBe(true);
    expect(getVercelDomainState).toHaveBeenCalledTimes(1);
  });

  it("serializes the same hostname across different target leases", async () => {
    reserveProviderOperation
      .mockResolvedValueOnce({ state: "reserved", retryAfter: 0 })
      .mockResolvedValueOnce({ state: "deduplicated", retryAfter: 8 });

    await expect(
      setDomain({ boardId: "board-1" }, "feedback.example.com", ACTOR),
    ).resolves.toEqual({
      ok: false,
      error: "operation_in_progress",
      retryAfter: 8,
    });
    expect(addDomainToVercel).not.toHaveBeenCalled();
    expect(removeDomainFromVercel).not.toHaveBeenCalled();
  });

  it("does not detach a hostname retained by a newer database mapping", async () => {
    reserveProviderOperation.mockResolvedValue({ state: "reserved", retryAfter: 0 });
    setFakeTable("custom_domains", [
      {
        ...ROW,
        id: "domain-new",
        board_id: "board-new",
      },
    ]);

    await detachDomainFromVercelOnly(ROW, ACTOR, {
      mutationAlreadyReserved: true,
    });

    expect(removeDomainFromVercel).not.toHaveBeenCalled();
  });
});
