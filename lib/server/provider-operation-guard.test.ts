import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ rpc }),
}));

const { releaseProviderOperation, reserveProviderOperation } = await import(
  "./provider-operation-guard"
);

const input = {
  actorId: "11111111-1111-4111-8111-111111111111",
  provider: "vercel-domains",
  operation: "refresh",
  resourceKey: "domain:feedback.example.com",
  limit: 20,
  windowSeconds: 60,
  dedupeSeconds: 15,
};

beforeEach(() => {
  rpc.mockReset();
});

describe("reserveProviderOperation", () => {
  it("passes every quota and deduplication parameter to the atomic RPC", async () => {
    rpc.mockResolvedValue({ data: { state: "reserved", retry_after: 0 }, error: null });

    await expect(reserveProviderOperation(input)).resolves.toEqual({
      state: "reserved",
      retryAfter: 0,
    });
    expect(rpc).toHaveBeenCalledWith("reserve_provider_operation", {
      p_actor_id: input.actorId,
      p_provider: input.provider,
      p_operation: input.operation,
      p_resource_key: input.resourceKey,
      p_limit: input.limit,
      p_window_seconds: input.windowSeconds,
      p_dedupe_seconds: input.dedupeSeconds,
    });
  });

  it("returns shared quota and resource-lease refusals with retry delays", async () => {
    rpc
      .mockResolvedValueOnce({
        data: { state: "quota_exceeded", retry_after: 7.2 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { state: "deduplicated", retry_after: 3 },
        error: null,
      });

    await expect(reserveProviderOperation(input)).resolves.toEqual({
      state: "quota_exceeded",
      retryAfter: 8,
    });
    await expect(reserveProviderOperation(input)).resolves.toEqual({
      state: "deduplicated",
      retryAfter: 3,
    });
  });

  it("fails closed on an RPC error or malformed response", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: "database unavailable" } })
      .mockResolvedValueOnce({ data: { state: "reserved-ish" }, error: null });

    await expect(reserveProviderOperation(input)).resolves.toEqual({
      state: "unavailable",
      retryAfter: 0,
    });
    await expect(reserveProviderOperation(input)).resolves.toEqual({
      state: "unavailable",
      retryAfter: 0,
    });
    consoleError.mockRestore();
  });
});

describe("releaseProviderOperation", () => {
  it("releases the matching lease without deleting its quota row", async () => {
    rpc.mockResolvedValue({ data: true, error: null });

    await expect(releaseProviderOperation(input)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("release_provider_operation", {
      p_actor_id: input.actorId,
      p_provider: input.provider,
      p_operation: input.operation,
      p_resource_key: input.resourceKey,
    });
  });

  it("reports a release failure without throwing from cleanup", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    await expect(releaseProviderOperation(input)).resolves.toBe(false);
  });
});
