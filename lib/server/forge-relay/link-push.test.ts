import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("pushRelayLinkEvent", () => {
  it("does not publish an empty authoritative snapshot after a database read failure", async () => {
    snapshotResult = { data: null, error: new Error("snapshot unavailable") };

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
    expect(console.warn).toHaveBeenCalledWith(
      "[forge-relay] link sync push failed:",
      "snapshot unavailable",
    );
  });
});
