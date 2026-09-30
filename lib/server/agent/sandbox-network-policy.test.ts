import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NetworkPolicy } from "@vercel/sandbox";

const h = vi.hoisted(() => ({
  created: false,
  resumed: false,
  allocation: null as null | { region: string; vcpus: number; memory: number },
  getOrCreate: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    getOrCreate: h.getOrCreate,
    get: h.get,
  },
}));

const { deleteSandboxByName, getOrCreateAgentSandbox } = await import("./sandbox");

const policy: NetworkPolicy = {
  allow: { "*": [] },
  subnets: { deny: ["127.0.0.0/8"] },
};

beforeEach(() => {
  vi.stubEnv("AGENT_EXECUTION_BACKEND", "vercel");
  vi.stubEnv("VERCEL", "1");
  h.created = false;
  h.resumed = false;
  h.allocation = null;
  vi.stubEnv("AGENT_SANDBOX_SNAPSHOT_ID", "");
  vi.stubEnv("AGENT_SANDBOX_SNAPSHOT_ID_EU", "");
  vi.stubEnv("AGENT_SANDBOX_SNAPSHOT_ID_US", "");
  h.update.mockReset();
  h.get.mockReset();
  h.delete.mockReset();
  h.get.mockResolvedValue({ delete: h.delete });
  h.getOrCreate.mockReset();
  h.getOrCreate.mockImplementation(async (params: {
    name: string;
    region: string;
    resources: { vcpus: number };
    networkPolicy?: NetworkPolicy;
    onCreate: (sandbox: unknown) => Promise<void>;
    onResume: (sandbox: unknown) => Promise<void>;
  }) => {
    const sandbox = {
      name: params.name,
      networkPolicy: params.networkPolicy,
      update: h.update,
      currentSession: () => h.allocation ?? {
        region: params.region,
        vcpus: params.resources.vcpus,
        memory: params.resources.vcpus * 2048,
      },
    };
    if (h.created) await params.onCreate(sandbox);
    if (h.resumed) await params.onResume(sandbox);
    return sandbox;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("persistent Sandbox network policy refresh", () => {
  it("erases old snapshots when an account is deleted", async () => {
    await deleteSandboxByName("agent-11111111-2222-4333-8444-555555555555");
    expect(h.get).toHaveBeenCalledWith(expect.objectContaining({
      name: "agent-11111111-2222-4333-8444-555555555555",
      resume: false,
    }));
    expect(h.delete).toHaveBeenCalledWith({ deleteOrphanSnapshots: true });
  });

  it("accepts a missing historical sandbox during erasure", async () => {
    h.get.mockRejectedValueOnce(Object.assign(new Error("not found"), {
      response: { status: 404 },
    }));
    await expect(deleteSandboxByName("agent-11111111-2222-4333-8444-555555555555"))
      .resolves.toBeUndefined();
  });

  it("does not snapshot a server run's plaintext filesystem", async () => {
    h.created = true;
    await getOrCreateAgentSandbox({ name: "agent-v2-11111111-2222-4333-8444-555555555555", onCreate: async () => {} });
    const options = h.getOrCreate.mock.calls[0][0];
    expect(options.persistent).toBe(false);
    expect(options).not.toHaveProperty("keepLastSnapshots");
    expect(options).not.toHaveProperty("snapshotExpiration");
  });

  it("recreates the checkout after a nonpersistent session stops", async () => {
    h.resumed = true;
    const onCreate = vi.fn(async () => {});
    const result = await getOrCreateAgentSandbox({
      name: "agent-v2-11111111-2222-4333-8444-555555555555",
      onCreate,
    });
    expect(onCreate).toHaveBeenCalledOnce();
    expect(result.created).toBe(true);
  });

  it("reserves memory for the supervisor alongside native compilers", async () => {
    h.created = true;
    await getOrCreateAgentSandbox({ name: "agent-resource-test", onCreate: async () => {} });
    expect(h.getOrCreate).toHaveBeenCalledWith(expect.objectContaining({
      region: "dub1",
      failoverRegions: [],
      resources: { vcpus: 4 },
      env: { GOMEMLIMIT: "2048MiB" },
    }));
  });

  it("updates a resumed Sandbox before returning it", async () => {
    await expect(
      getOrCreateAgentSandbox({
        name: "agent-11111111-2222-4333-8444-555555555555",
        networkPolicy: policy,
        onCreate: async () => {},
      }),
    ).resolves.toMatchObject({ created: false });

    expect(h.update).toHaveBeenCalledExactlyOnceWith({ networkPolicy: policy });
  });

  it("propagates a refresh failure instead of running with stale credentials", async () => {
    const failure = Object.assign(new Error("Vercel Sandbox unavailable"), { status: 503 });
    h.update.mockRejectedValueOnce(failure);

    await expect(
      getOrCreateAgentSandbox({
        name: "agent-11111111-2222-4333-8444-555555555555",
        networkPolicy: policy,
        onCreate: async () => {},
      }),
    ).rejects.toBe(failure);
  });

  it("does not update twice when creation already installed the policy", async () => {
    h.created = true;

    await expect(
      getOrCreateAgentSandbox({
        name: "agent-11111111-2222-4333-8444-555555555555",
        networkPolicy: policy,
        onCreate: async () => {},
      }),
    ).resolves.toMatchObject({ created: true });

    expect(h.update).not.toHaveBeenCalled();
  });
});


describe("sandbox allocation preferences", () => {
  it.each([
    ["eu", "standard", "dub1", 4, 0.3148],
    ["us", "standard", "iad1", 4, 0.24],
    ["eu", "performance", "dub1", 8, 0.6296],
    ["us", "performance", "iad1", 8, 0.48],
  ] as const)("creates %s / %s with matching billing", async (region, size, code, vcpus, hourly) => {
    h.created = true;
    const result = await getOrCreateAgentSandbox({
      name: "agent-test", onCreate: async () => {},
      preferences: { sandbox_region: region, sandbox_size: size },
    });
    expect(h.getOrCreate).toHaveBeenCalledWith(expect.objectContaining({
      region: code, failoverRegions: [], resources: { vcpus },
    }));
    expect(result.billing).toMatchObject({ region: code, vcpus, memoryMb: vcpus * 2048 });
    expect(result.billing!.usdPerMinute * 60).toBeCloseTo(hourly, 8);
  });

  it("bills the resumed allocation even after the account preference changes", async () => {
    h.allocation = { region: "iad1", vcpus: 2, memory: 4096 };
    const result = await getOrCreateAgentSandbox({
      name: "agent-existing", onCreate: async () => {},
      preferences: { sandbox_region: "eu", sandbox_size: "performance" },
    });
    expect(result.billing).toEqual({ region: "iad1", vcpus: 2, memoryMb: 4096, usdPerMinute: 0.002 });
  });

  it("ignores the legacy US snapshot when creating in Europe", async () => {
    vi.stubEnv("AGENT_SANDBOX_SNAPSHOT_ID", "snap-us");
    await getOrCreateAgentSandbox({ name: "agent-eu", onCreate: async () => {} });
    expect(h.getOrCreate.mock.calls[0][0]).not.toHaveProperty("source");
  });

  it("ignores configured regional snapshots of unknown provenance", async () => {
    vi.stubEnv("AGENT_SANDBOX_SNAPSHOT_ID_EU", "snap-eu");
    await getOrCreateAgentSandbox({ name: "agent-eu", onCreate: async () => {} });
    expect(h.getOrCreate.mock.calls[0][0]).toMatchObject({ region: "dub1" });
    expect(h.getOrCreate.mock.calls[0][0]).not.toHaveProperty("source");
  });
});
