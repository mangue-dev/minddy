import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const relayRequest = vi.fn(async () => ({ ok: true, error: null, data: null }));
let snapshotResult: { data: unknown[] | null; error: Error | null };

vi.mock("./client", () => ({ relayRequest }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: async () => snapshotResult,
      }),
    }),
  }),
}));

const { pushRelayLinkEvent } = await import("./link-push");

beforeEach(() => {
  relayRequest.mockClear();
  snapshotResult = { data: [], error: null };
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("pushRelayLinkEvent", () => {
  it("does not publish an empty authoritative snapshot after a database read failure", async () => {
    vi.stubEnv("NODE_ENV", "production");
    snapshotResult = { data: null, error: new Error("MIN591_PRIVATE_LINK_SENTINEL") };

    await expect(
      pushRelayLinkEvent({
        event: "unlinked",
        provider: "github",
        repoId: "42",
        repo: "acme/app",
        connectionId: "connection-1",
      }),
    ).resolves.toBeUndefined();

    expect(relayRequest).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    expect(vi.mocked(console.warn).mock.calls.flat().map(String).join("\n"))
      .not.toContain("MIN591_PRIVATE_LINK_SENTINEL");
  });
});
