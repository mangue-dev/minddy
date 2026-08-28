import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NetworkPolicy } from "@vercel/sandbox";

const h = vi.hoisted(() => ({
  created: false,
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
  h.update.mockReset();
  h.getOrCreate.mockReset();
  h.getOrCreate.mockImplementation(async (params: {
    name: string;
    networkPolicy?: NetworkPolicy;
    onCreate: (sandbox: unknown) => Promise<void>;
  }) => {
    const sandbox = {
      name: params.name,
      networkPolicy: params.networkPolicy,
      update: h.update,
    };
    if (h.created) await params.onCreate(sandbox);
    return sandbox;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("persistent Sandbox network policy refresh", () => {
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
