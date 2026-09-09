import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NetworkPolicy } from "@vercel/sandbox";

const h = vi.hoisted(() => ({
  created: false,
  allocation: null as null | { region: string; vcpus: number; memory: number },
  getOrCreate: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    getOrCreate: h.getOrCreate,
  },
}));

const { getOrCreateAgentSandbox } = await import("./sandbox");

const policy: NetworkPolicy = {
  allow: { "*": [] },
  subnets: { deny: ["127.0.0.0/8"] },
};

beforeEach(() => {
  vi.stubEnv("AGENT_EXECUTION_BACKEND", "vercel");
  vi.stubEnv("VERCEL", "1");
  h.created = false;
  h.allocation = null;
  vi.stubEnv("AGENT_SANDBOX_SNAPSHOT_ID", "");
  vi.stubEnv("AGENT_SANDBOX_SNAPSHOT_ID_EU", "");
  vi.stubEnv("AGENT_SANDBOX_SNAPSHOT_ID_US", "");
  h.update.mockReset();
  h.getOrCreate.mockReset();
  h.getOrCreate.mockImplementation(async (params: {
    name: string;
    region: string;
    resources: { vcpus: number };
    networkPolicy?: NetworkPolicy;
    onCreate: (sandbox: unknown) => Promise<void>;
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
    return sandbox;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("persistent Sandbox network policy refresh", () => {
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

  it("does not use the legacy US snapshot when creating in Europe", async () => {
    vi.stubEnv("AGENT_SANDBOX_SNAPSHOT_ID", "snap-us");
    await getOrCreateAgentSandbox({ name: "agent-eu", onCreate: async () => {} });
    expect(h.getOrCreate.mock.calls[0][0]).not.toHaveProperty("source");
  });

  it("uses the region-specific warm image", async () => {
    vi.stubEnv("AGENT_SANDBOX_SNAPSHOT_ID_EU", "snap-eu");
    await getOrCreateAgentSandbox({ name: "agent-eu", onCreate: async () => {} });
    expect(h.getOrCreate.mock.calls[0][0]).toMatchObject({
      region: "dub1", source: { type: "snapshot", snapshotId: "snap-eu" },
    });
  });
});
