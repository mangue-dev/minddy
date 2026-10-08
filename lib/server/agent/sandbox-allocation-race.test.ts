import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  exists: false, fenced: false, attachFails: false, providerRejects: false, rejectAfterClone: false, enumerationTruncated: false, currentName: "",
  release: null as null | (() => void), started: null as null | (() => void),
  rows: [] as Array<{ id: string; sandbox_name: string; provider_key_id: string | null; provider_pending: boolean; key_request_pending?: boolean; state: string }>,
  deleted: vi.fn(async () => {}), revoked: vi.fn(async (_key: string) => {}),
}));

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({
  rpc: async (name: string, args: Record<string, string>) => {
    const row = state.rows.find((candidate) => candidate.id === args.p_id);
    let data: unknown = true;
    if (name === "retire_previous_agent_allocations") {
      data = state.rows.filter((candidate) => candidate.state === "attached" && !candidate.provider_pending);
    } else if (name === "reserve_agent_sandbox_allocation") {
      if (state.fenced || state.rows.some((candidate) => candidate.provider_pending || candidate.state === "revoked")) {
        return { data: null, error: { code: "P0001" } };
      }
      const id = `allocation-${state.rows.length}`;
      state.rows.push({ id, sandbox_name: args.p_sandbox_name, provider_key_id: null, provider_pending: true, state: "reserved" });
      data = id;
    } else if (name === "attach_agent_sandbox_allocation") {
      data = !state.fenced && !state.attachFails && row?.state !== "revoked";
      if (data && row) row.state = "attached";
    } else if (name === "record_agent_allocation_key" && row) {
      row.provider_key_id = args.p_key_id;
      row.key_request_pending = false;
      data = row.state !== "revoked";
    } else if (name === "revoke_agent_sandbox_allocation" && row) {
      row.state = "revoked";
    } else if (name === "begin_agent_allocation_key_request" && row) {
      row.key_request_pending = true;
    } else if (name === "confirm_agent_allocation_key_revoked" && row) {
      row.provider_key_id = null; row.key_request_pending = false;
    } else if (name === "settle_agent_sandbox_allocation" && row) {
      row.provider_pending = false;
    } else if (name === "complete_agent_allocation_cleanup" && row) {
      data = !row.provider_pending && !row.key_request_pending;
      if (data) row.state = "cleaned";
    } else if (name === "next_agent_allocation_cleanup_batch") {
      data = state.rows.filter((candidate) => candidate.state === "revoked").map((candidate) => ({ ...candidate }));
    } else if (name === "agent_allocation_erasure_complete") {
      data = !state.enumerationTruncated && state.rows.every((candidate) => candidate.state === "cleaned");
    } else if (name === "revoke_agent_sandbox_allocations") {
      data = state.rows.filter((candidate) => candidate.state !== "cleaned").map((candidate) => {
        candidate.state = "revoked";
        return { ...candidate };
      });
    }
    return { data, error: null };
  },
}) }));
vi.mock("./run-key", () => ({ revokeRunKeyStrict: state.revoked }));
vi.mock("@vercel/sandbox", () => ({ Sandbox: {
  get: vi.fn(async (opts: { name: string }) => {
    if (!state.exists || state.currentName !== opts.name) throw Object.assign(new Error("missing"), { response: { status: 404 } });
    return { delete: async () => { await state.deleted(); state.exists = false; } };
  }),
  getOrCreate: vi.fn(async (opts: { name: string; onCreate: (sandbox: unknown) => Promise<void> }) => {
    state.started?.();
    await new Promise<void>((resolve) => { state.release = resolve; });
    if (state.providerRejects) throw new Error("synthetic request outcome unknown");
    state.exists = true;
    state.currentName = opts.name;
    const sandbox = { name: opts.name, currentSession: () => ({ region: "dub1", vcpus: 4, memory: 8192 }) };
    await opts.onCreate(sandbox);
    if (state.rejectAfterClone) throw new Error("synthetic final provider response lost");
    return sandbox;
  }),
} }));
vi.mock("./self-hosted-sandbox", () => ({ SelfHostedSandbox: class {
  static async getOrCreate(name: string) {
    state.started?.();
    await new Promise<void>((resolve) => { state.release = resolve; });
    if (state.providerRejects) throw new Error("synthetic request outcome unknown");
    state.exists = true;
    state.currentName = name;
    return { sandbox: { name }, created: true };
  }
  static async delete(name: string) { await state.deleted(); if (state.currentName === name) state.exists = false; }
} }));

import { allocateReservedSandbox, beginAllocationKeyRequest, cleanupSandboxAllocation, eraseSandboxAllocations, recordAllocationKey, reserveSandboxAllocation, retryRevokedSandboxAllocations } from "./sandbox-allocation";
const RUN = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  state.exists = false; state.fenced = false; state.attachFails = false; state.providerRejects = false; state.rejectAfterClone = false; state.enumerationTruncated = false; state.currentName = "";
  state.rows = []; state.release = null; state.started = null;
  state.deleted.mockReset(); state.revoked.mockReset();
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("MINDDY_DATA_ROOT_KEY", "ab".repeat(32));
  vi.stubEnv("AGENT_RUNNER_URL", "http://synthetic.invalid");
  vi.stubEnv("AGENT_RUNNER_SECRET", "synthetic");
});

it("revokes and sweeps a Vercel allocation whose response is lost after private bootstrap", async () => {
  vi.stubEnv("AGENT_EXECUTION_BACKEND", "vercel");
  const allocation = await reserveSandboxAllocation(RUN);
  state.rejectAfterClone = true;
  const privateClone = vi.fn(async () => {});
  const created = allocateReservedSandbox(allocation, { name: allocation.sandbox_name, onCreate: privateClone });
  const rejected = expect(created).rejects.toThrow("agent_allocation_provider_outcome_unknown");
  while (!state.release) await Promise.resolve(); state.release(); await rejected;
  expect(privateClone).toHaveBeenCalled();
  expect(state.exists).toBe(true);
  expect(state.rows[0].state).toBe("revoked");
  await retryRevokedSandboxAllocations();
  expect(state.exists).toBe(false);
  expect(state.rows[0].provider_pending).toBe(true);
  expect(state.rows[0].state).toBe("revoked");
});

describe.each(["vercel", "self-hosted"])("durable %s allocation erasure", (backend) => {
  beforeEach(() => { vi.stubEnv("AGENT_EXECUTION_BACKEND", backend); });

  it("blocks erasure until a late allocation is deleted and its new key revoked", async () => {
    const allocation = await reserveSandboxAllocation(RUN);
    await recordAllocationKey(allocation, "new-key");
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => { entered = resolve; });
    state.started = entered;
    const clone = vi.fn(async () => {});
    const created = allocateReservedSandbox(allocation, { name: allocation.sandbox_name, onCreate: clone });
    const rejected = expect(created).rejects.toThrow("agent_allocation_revoked");
    await reached;
    state.fenced = true;
    await expect(eraseSandboxAllocations("account", "owner")).rejects.toThrow("agent_allocation_in_flight");
    expect(state.rows[0].provider_pending).toBe(true);
    state.release!(); await rejected;
    expect(state.exists).toBe(false);
    expect(clone).not.toHaveBeenCalled();
    expect(state.revoked).toHaveBeenCalledWith("new-key");
    await expect(eraseSandboxAllocations("account", "owner")).resolves.toBeUndefined();
  });

  it("refuses reservation when erasure wins before allocation", async () => {
    state.fenced = true;
    await expect(reserveSandboxAllocation(RUN)).rejects.toThrow("agent_allocation_coordination_failed");
    expect(state.rows).toHaveLength(0);
  });

  it("does not certify erasure when RPC row enumeration was truncated", async () => {
    state.fenced = true; state.enumerationTruncated = true;
    await expect(eraseSandboxAllocations("project", "project")).rejects.toThrow("agent_allocation_erasure_incomplete");
  });

  it("cleans a physical allocation after SQL attachment failure", async () => {
    const allocation = await reserveSandboxAllocation(RUN);
    await recordAllocationKey(allocation, "new-key");
    state.attachFails = true;
    const created = allocateReservedSandbox(allocation, { name: allocation.sandbox_name, onCreate: async () => {} });
    const rejected = expect(created).rejects.toThrow("agent_allocation_revoked");
    while (!state.release) await Promise.resolve();
    state.release(); await rejected;
    expect(state.exists).toBe(false);
    expect(state.rows[0].state).toBe("cleaned");
    expect(state.revoked).toHaveBeenCalledWith("new-key");
  });

  it("retains failed cleanup evidence and completes only after a successful retry", async () => {
    const allocation = await reserveSandboxAllocation(RUN);
    await recordAllocationKey(allocation, "new-key");
    const created = allocateReservedSandbox(allocation, { name: allocation.sandbox_name, onCreate: async () => {} });
    while (!state.release) await Promise.resolve();
    state.release(); await created;
    state.fenced = true;
    state.revoked.mockRejectedValueOnce(new Error("synthetic revocation failure"));
    await expect(eraseSandboxAllocations("project", "project")).rejects.toThrow("synthetic revocation failure");
    expect(state.rows[0].state).toBe("revoked");
    await expect(eraseSandboxAllocations("project", "project")).resolves.toBeUndefined();
    expect(state.rows[0].state).toBe("cleaned");
  });

  it("keeps uncertain provider failures blocked while periodic sweeps delete late objects", async () => {
    const allocation = await reserveSandboxAllocation(RUN);
    state.providerRejects = true;
    const created = allocateReservedSandbox(allocation, { name: allocation.sandbox_name, onCreate: async () => {} });
    const rejected = expect(created).rejects.toThrow("agent_allocation_provider_outcome_unknown");
    while (!state.release) await Promise.resolve();
    state.release(); await rejected;
    expect(state.rows[0].state).toBe("revoked");
    await retryRevokedSandboxAllocations();
    expect(state.rows[0].provider_pending).toBe(true);
    state.fenced = true;
    await expect(eraseSandboxAllocations("account", "owner")).rejects.toThrow("agent_allocation_in_flight");
    state.exists = true; state.currentName = allocation.sandbox_name;
    await retryRevokedSandboxAllocations();
    expect(state.exists).toBe(false);
    expect(state.rows[0].provider_pending).toBe(true);
    expect(state.rows[0].state).toBe("revoked");
  });

  it("never certifies an uncertain key provisioning request", async () => {
    const allocation = await reserveSandboxAllocation(RUN);
    await beginAllocationKeyRequest(allocation);
    await expect(cleanupSandboxAllocation(allocation)).rejects.toThrow("agent_key_provisioning_outcome_unknown");
    state.fenced = true;
    await expect(eraseSandboxAllocations("account", "owner")).rejects.toThrow("agent_key_provisioning_outcome_unknown");
    expect(state.rows[0].state).toBe("revoked");
    expect(state.rows[0].key_request_pending).toBe(true);
  });

  it("does not let a stale cleaner delete the next allocation generation", async () => {
    const first = await reserveSandboxAllocation(RUN);
    const created = allocateReservedSandbox(first, { name: first.sandbox_name, onCreate: async () => {} });
    while (!state.release) await Promise.resolve(); state.release(); await created;
    const staleCleaner = { ...first };
    const next = await reserveSandboxAllocation(RUN);
    expect(next.sandbox_name).not.toBe(first.sandbox_name);
    state.release = null;
    const successor = allocateReservedSandbox(next, { name: next.sandbox_name, onCreate: async () => {} });
    while (!state.release) await Promise.resolve(); (state.release as () => void)(); await successor;
    await cleanupSandboxAllocation(staleCleaner);
    expect(state.exists).toBe(true);
    expect(state.currentName).toBe(next.sandbox_name);
  });
});
