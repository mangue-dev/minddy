import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const material = Buffer.alloc(32, 71);
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => new EncryptedStore({
    current: async () => ({ version: 2, bytes: Buffer.from(material) }),
    byVersion: async (_scope: unknown, version: number) => {
      if (version !== 2) throw new Error("Unknown key version");
      return { version, bytes: Buffer.from(material) };
    },
  }),
}));

import { conversationTitleState, decodeConversationTitle,
  encodeConversationTitle } from "./conversation-title-content";

describe("Numo assistant conversation titles", () => {
  it("hides issue-derived titles and binds owner, conversation and key version", async () => {
    const title = "Private issue title from an automation";
    const stored = await encodeConversationTitle("user-1", "conversation-1", title);
    expect(stored).not.toContain(title);
    expect(conversationTitleState(stored!)).toEqual({ version: 2, format: 3 });
    expect(await decodeConversationTitle("user-1", "conversation-1", stored))
      .toBe(title);
    await expect(decodeConversationTitle("user-2", "conversation-1", stored))
      .rejects.toThrow();
    await expect(decodeConversationTitle("user-1", "conversation-2", stored))
      .rejects.toThrow();
    await expect(decodeConversationTitle("user-1", "conversation-1",
      stored!.replace("mdyn3:2:", "mdyn3:1:"))).rejects.toThrow();
  });
});
