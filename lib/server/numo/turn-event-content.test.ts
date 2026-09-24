import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const material = Buffer.alloc(32, 37);
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => new EncryptedStore({
    current: async () => ({ version: 2, bytes: Buffer.from(material) }),
    byVersion: async (_scope: unknown, version: number) => {
      if (version !== 2) throw new Error("Unknown key version");
      return { version, bytes: Buffer.from(material) };
    },
  }),
}));

import { decodeNumoTurnEvent, encodeNumoTurnEvent,
  numoTurnEventState } from "./turn-event-content";

describe("durable Numo activity payloads", () => {
  it("hides content and binds the user, turn, event, and key version", async () => {
    const userId = "user-1", turnId = "turn-1", eventId = "event-1";
    const clear = { delta: "Private issue title" };
    const stored = await encodeNumoTurnEvent(userId, turnId, eventId, clear);
    expect(JSON.stringify(stored)).not.toContain(clear.delta);
    expect(numoTurnEventState(stored)).toEqual({ version: 2, format: 3 });
    expect(await decodeNumoTurnEvent(stored, { userId, turnId, eventId }))
      .toEqual(clear);
    await expect(decodeNumoTurnEvent(stored, {
      userId: "other", turnId, eventId,
    })).rejects.toThrow();
    await expect(decodeNumoTurnEvent(stored, {
      userId, turnId: "other", eventId,
    })).rejects.toThrow();
    await expect(decodeNumoTurnEvent(stored, {
      userId, turnId, eventId: "other",
    })).rejects.toThrow();
    await expect(decodeNumoTurnEvent({ ...stored, encryption_version: 1 }, {
      userId, turnId, eventId,
    })).rejects.toThrow();
  });
});
