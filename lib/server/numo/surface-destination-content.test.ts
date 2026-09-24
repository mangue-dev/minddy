import { afterEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => new EncryptedStore({
    current: async () => ({ version: 2, bytes: Buffer.alloc(32, 71) }),
    byVersion: async (_scope: unknown, version: number) => {
      if (version !== 2) throw new Error("Unknown key version");
      return { version, bytes: Buffer.alloc(32, 71) };
    },
  }),
}));

import { decodeSurfaceDestination, encodeSurfaceDestination,
  isEncryptedSurfaceDestination, surfaceDestinationState } from
  "./surface-destination-content";

afterEach(() => vi.unstubAllEnvs());

describe("Numo surface destination encryption", () => {
  it("hides the destination in storage and binds it to its actor and event", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    vi.stubEnv("MINDDY_NUMO_SURFACE_DESTINATION_ENCRYPTION_ENABLED", "true");
    const input = { kind: "pull_request" as const,
      pullRequestId: "private-pr-identifier" };
    const stored = await encodeSurfaceDestination("user-one", "event-one", input);
    expect(isEncryptedSurfaceDestination(stored)).toBe(true);
    expect(JSON.stringify(stored)).not.toContain(input.pullRequestId);
    expect(surfaceDestinationState(stored)).toEqual({ version: 2, format: 3 });
    expect(await decodeSurfaceDestination("user-one", "event-one", stored))
      .toEqual(input);
    await expect(decodeSurfaceDestination("user-two", "event-one", stored))
      .rejects.toThrow();
    await expect(decodeSurfaceDestination("user-one", "event-two", stored))
      .rejects.toThrow();
  });
});
