import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const material = Buffer.alloc(32, 43);
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => new EncryptedStore({
    current: async () => ({ version: 2, bytes: Buffer.from(material) }),
    byVersion: async (_scope: unknown, version: number) => {
      if (version !== 2) throw new Error("Unknown key version");
      return { version, bytes: Buffer.from(material) };
    },
  }),
}));

import { decodeNumoTurnIntent, encodeNumoTurnIntent,
  numoTurnIntentState } from "./turn-intent-content";

describe("durable Numo turn admission context", () => {
  it("hides issue snapshots and binds user, conversation, request and key", async () => {
    const userId = "user-1", conversationId = "conversation-1";
    const requestId = "request-1";
    const clear = { automation: { issue: { title: "Private issue title",
      plan: "Private implementation plan" } } };
    const stored = await encodeNumoTurnIntent(userId, conversationId,
      requestId, clear);
    expect(JSON.stringify(stored)).not.toContain("Private issue title");
    expect(JSON.stringify(stored)).not.toContain("Private implementation plan");
    expect(numoTurnIntentState(stored)).toEqual({ version: 2, format: 3 });
    const expected = { userId, conversationId, requestId };
    expect(await decodeNumoTurnIntent(stored, expected)).toEqual(clear);
    await expect(decodeNumoTurnIntent(stored, { ...expected,
      userId: "other" })).rejects.toThrow();
    await expect(decodeNumoTurnIntent(stored, { ...expected,
      conversationId: "other" })).rejects.toThrow();
    await expect(decodeNumoTurnIntent(stored, { ...expected,
      requestId: "other" })).rejects.toThrow();
    await expect(decodeNumoTurnIntent({ ...stored, encryption_version: 1 },
      expected)).rejects.toThrow();
  });
});
