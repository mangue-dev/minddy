import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  keyPending: false, cleaned: false, order: [] as string[],
  rpc: vi.fn(async (name: string) => {
    h.order.push(name);
    if (name === "begin_agent_allocation_key_request") h.keyPending = true;
    if (name === "complete_agent_allocation_cleanup") {
      if (h.keyPending) return { data: false, error: null };
      h.cleaned = true;
    }
    if (name === "revoke_agent_sandbox_allocations") return { data: [{
      id: "allocation-1", sandbox_name: "synthetic-sandbox", provider_key_id: null,
      provider_pending: false, key_request_pending: h.keyPending, state: "revoked",
    }], error: null };
    return { data: true, error: null };
  }),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ rpc: h.rpc }) }));
vi.mock("./sandbox", () => ({ deleteSandboxByName: async () => {} }));

import { cleanupSandboxAllocation, eraseSandboxAllocations, mintAllocationRunKey, type SandboxAllocation } from "./sandbox-allocation";

beforeEach(() => {
  h.keyPending = false; h.cleaned = false; h.order = []; h.rpc.mockClear();
  vi.stubEnv("OPENROUTER_PROVISIONING_KEY", "synthetic-provisioning");
  vi.stubEnv("NODE_ENV", "production");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("durable provisioning intent at the real run-key request", () => {
  it.each(["http", "json", "transport", "missing-hash"])("blocks erasure after a %s failure", async (failure) => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      h.order.push("provider_request");
      if (failure === "transport") throw new Error("MIN591_PRIVATE_KEY_TRANSPORT");
      return { ok: failure !== "http", status: failure === "http" ? 403 : 200,
        text: async () => "MIN591_PRIVATE_KEY_PROVIDER_BODY",
        json: async () => {
          if (failure === "json") throw new Error("MIN591_PRIVATE_KEY_JSON");
          return { key: "MIN591_PRIVATE_KEY_SECRET", data: {} };
        } };
    }));
    const allocation: SandboxAllocation = { id: "allocation-1", sandbox_name: "synthetic-sandbox",
      provider_key_id: null, provider_pending: true, state: "reserved", providerRequestStarted: false };
    await expect(mintAllocationRunKey(allocation, { runId: "run-1", capUsd: 1 })).rejects.toThrow("agent_key_provisioning_outcome_unknown");
    expect(h.order.slice(0, 2)).toEqual(["begin_agent_allocation_key_request", "provider_request"]);
    await expect(cleanupSandboxAllocation(allocation)).rejects.toThrow("agent_key_provisioning_outcome_unknown");
    await expect(eraseSandboxAllocations("account", "owner")).rejects.toThrow("agent_key_provisioning_outcome_unknown");
    expect(h.keyPending).toBe(true); expect(h.cleaned).toBe(false);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("MIN591_PRIVATE");
  });

  it("keeps the no-request fallback when provisioning is not configured", async () => {
    vi.stubEnv("OPENROUTER_PROVISIONING_KEY", "");
    const provider = vi.fn(); vi.stubGlobal("fetch", provider);
    const allocation: SandboxAllocation = { id: "allocation-1", sandbox_name: "synthetic-sandbox",
      provider_key_id: null, provider_pending: true, state: "reserved", providerRequestStarted: false };
    await expect(mintAllocationRunKey(allocation, { runId: "run-1", capUsd: 1 })).resolves.toBeNull();
    expect(provider).not.toHaveBeenCalled();
    expect(h.keyPending).toBe(false);
  });
});
