import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { FakeQuery, fakeTables, setFakeTable } from "@/test/forge-relay/fake-supabase";

const h = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), configured: vi.fn(), inventory: vi.fn(),
  remove: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({
  rpc: h.rpc,
  from: h.from,
}) }));
vi.mock("@/lib/server/vercel-domains", () => ({
  isVercelDomainsConfigured: h.configured,
  listVercelProjectDomains: h.inventory,
  removeDomainFromVercel: h.remove,
}));
vi.mock("@/lib/custom-domain-lookup", () => ({ invalidateCustomDomainCache: h.invalidate }));

import { cleanRemovedDomain, reconcileCustomDomains } from "./custom-domain-cleanup";
import { GET } from "@/app/api/cron/custom-domains/route";

const domain = "feedback.example.com";
const row = { domain, id: "cleanup-1", attempts: 0, next_attempt_at: "2020-01-01T00:00:00Z" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  h.configured.mockReturnValue(true);
  h.inventory.mockResolvedValue([]);
  h.remove.mockResolvedValue({ ok: true });
  h.from.mockImplementation((name: string) => new FakeQuery(name));
  h.rpc.mockImplementation(async (name) => ({
    data: name === "acquire_custom_domain_lease" ? "lease-1" : 0, error: null,
  }));
  setFakeTable("custom_domains", []);
  setFakeTable("custom_domain_cleanup", [{ ...row }]);
});

describe("durable custom domain cleanup", () => {
  it("detaches and acknowledges a cascaded domain under its hostname lease", async () => {
    await cleanRemovedDomain(domain);
    expect(h.remove).toHaveBeenCalledWith(domain);
    expect(fakeTables.custom_domain_cleanup).toEqual([]);
    expect(h.rpc).toHaveBeenLastCalledWith("release_custom_domain_lease", {
      p_domain: domain, p_token: "lease-1",
    });
    expect(h.invalidate).toHaveBeenCalledWith(domain);
  });

  it("keeps provider failures for retry and later acknowledges success", async () => {
    h.remove.mockRejectedValueOnce(new Error("network outage"));
    await cleanRemovedDomain(domain);
    expect(fakeTables.custom_domain_cleanup[0]).toMatchObject({ id: row.id, attempts: 1 });
    expect(Date.parse(String(fakeTables.custom_domain_cleanup[0].next_attempt_at)))
      .toBeGreaterThan(Date.now());
    await cleanRemovedDomain(domain);
    expect(fakeTables.custom_domain_cleanup).toEqual([]);
  });

  it("retains a newer mapping without detaching its provider attachment", async () => {
    setFakeTable("custom_domains", [{ id: "new-mapping", domain }]);
    await cleanRemovedDomain(domain);
    expect(h.remove).not.toHaveBeenCalled();
    expect(fakeTables.custom_domain_cleanup).toEqual([]);
  });

  it("checks a reassignment that completed before the cleanup lease was granted", async () => {
    h.rpc.mockImplementation(async (name) => {
      if (name === "acquire_custom_domain_lease") {
        setFakeTable("custom_domains", [{ id: "new-mapping", domain }]);
      }
      return { data: "lease-1", error: null };
    });
    await cleanRemovedDomain(domain);
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("fails closed when the retained-mapping lookup fails", async () => {
    h.from.mockImplementation((name: string) => {
      if (name !== "custom_domains") return new FakeQuery(name);
      const query = { select: () => query, eq: () => query,
        maybeSingle: async () => ({ data: null, error: { message: "database unavailable" } }) };
      return query;
    });
    await cleanRemovedDomain(domain);
    expect(h.remove).not.toHaveBeenCalled();
    expect(fakeTables.custom_domain_cleanup[0]).toMatchObject({ id: row.id, attempts: 1 });
  });

  it("leaves work queued while an attachment owns the hostname lease", async () => {
    h.rpc.mockResolvedValue({ data: null, error: null });
    await cleanRemovedDomain(domain);
    expect(h.remove).not.toHaveBeenCalled();
    expect(fakeTables.custom_domain_cleanup).toEqual([row]);
  });

  it("does not acknowledge a newer deletion queued during provider cleanup", async () => {
    h.remove.mockImplementation(async () => {
      setFakeTable("custom_domain_cleanup", [{ ...row, id: "cleanup-new" }]);
      return { ok: true };
    });
    await cleanRemovedDomain(domain);
    expect(fakeTables.custom_domain_cleanup[0].id).toBe("cleanup-new");
  });

  it("protects application and preview hosts even if they were queued", async () => {
    for (const host of ["www.minddy.app", "preview.minddy.app", "deploy.vercel.app"]) {
      setFakeTable("custom_domain_cleanup", [{ ...row, domain: host }]);
      await cleanRemovedDomain(host);
    }
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("reconciles inactive targets before retrying cascaded domains", async () => {
    setFakeTable("custom_domain_cleanup", []);
    h.rpc.mockImplementation(async (name) => {
      if (name === "reconcile_inactive_custom_domains") {
        setFakeTable("custom_domain_cleanup", [{ ...row }]);
      }
      return { data: name === "acquire_custom_domain_lease" ? "lease-1" : 1, error: null };
    });
    expect(await reconcileCustomDomains()).toMatchObject({ ok: true, removed: 1 });
    expect(h.rpc).toHaveBeenNthCalledWith(1, "reconcile_inactive_custom_domains");
    expect(h.remove).toHaveBeenCalledExactlyOnceWith(domain);
    expect(fakeTables.custom_domain_cleanup).toEqual([]);
  });

  it("preserves an old secondary application alias without a Minddy deletion entry", async () => {
    const alias = "secondary.example.org";
    vi.stubEnv("MINDDY_PUBLIC_APP_URL", "https://app.example.org");
    h.inventory.mockResolvedValue([
      { name: domain, createdAt: 1 },
      { name: alias, createdAt: 1 },
    ]);
    await reconcileCustomDomains();
    await cleanRemovedDomain(alias);
    expect(h.remove).toHaveBeenCalledExactlyOnceWith(domain);
    expect(h.inventory).not.toHaveBeenCalled();
    expect(fakeTables.custom_domain_cleanup).toEqual([]);
  });

  it("is inert when the provider is not configured", async () => {
    h.configured.mockReturnValue(false);
    expect(await reconcileCustomDomains()).toEqual({ ok: true, skipped: true });
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.inventory).not.toHaveBeenCalled();
  });

  it("requires cron authentication before reading or deleting domains", async () => {
    expect((await GET(new NextRequest("https://minddy.app/api/cron/custom-domains"))).status).toBe(401);
    expect(h.rpc).not.toHaveBeenCalled();
    vi.stubEnv("CRON_SECRET", "cron-test-secret");
    const response = await GET(new NextRequest("https://minddy.app/api/cron/custom-domains", {
      headers: { authorization: "Bearer cron-test-secret" },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, removed: 1 });
  });

  it("returns a retryable cron failure when provider removal fails", async () => {
    vi.stubEnv("CRON_SECRET", "cron-test-secret");
    h.remove.mockResolvedValue({ ok: false });
    const response = await GET(new NextRequest("https://minddy.app/api/cron/custom-domains", {
      headers: { authorization: "Bearer cron-test-secret" },
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, failed: 1 });
    expect(fakeTables.custom_domain_cleanup).toHaveLength(1);
  });
});
