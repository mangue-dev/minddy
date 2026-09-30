import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EncryptedStore } from "@/lib/server/encryption/store";

const material = Buffer.alloc(32, 63);
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => new EncryptedStore({
    current: async () => ({ version: 2, bytes: Buffer.from(material) }),
    byVersion: async (_scope: unknown, version: number) => {
      if (version !== 2) throw new Error("Unknown key version");
      return { version, bytes: Buffer.from(material) };
    },
  }),
}));

import { decodeNumoUserMessage, encodeNumoUserMessage,
  hydrateNumoUserMessages, numoUserMessageState } from "./user-message-content";

describe("durable Numo user messages", () => {
  it("hides prompt, context and metadata in the source and projected fields", async () => {
    const clear = { content: "Private issue title",
      context: { issue: "Private issue detail" },
      metadata: { attachments: ["Private file name"] },
      tool_calls: ["Private tool call"], tool_call_id: "Private call id",
      tool_name: "Private tool name" };
    const stored = await encodeNumoUserMessage("owner", "message", clear);
    expect(JSON.stringify(stored)).not.toContain("Private");
    expect(stored.context).toBeNull();
    expect(stored.metadata).toEqual({});
    expect(stored.tool_calls).toBeNull();
    expect(numoUserMessageState(stored.content)).toEqual({ version: 2, format: 3 });
    expect(await decodeNumoUserMessage("owner", stored)).toMatchObject(clear);
    await expect(decodeNumoUserMessage("other", stored)).rejects.toThrow();
    await expect(decodeNumoUserMessage("owner", { ...stored,
      id: "other-message" })).rejects.toThrow();
    await expect(decodeNumoUserMessage("owner", { ...stored,
      user_payload_version: 1 })).rejects.toThrow();
  });

  it("hydrates only a matching authorized projection", async () => {
    const stored = await encodeNumoUserMessage("owner", "message", {
      content: "Private prompt", context: { page: "Private page" },
      metadata: { file: "Private filename" }, tool_calls: null,
      tool_call_id: null, tool_name: null,
    });
    const projected = { ...stored, source: "assistant", role: "user" };
    const client = { from: () => ({ select: () => ({ in: async () => ({
      data: [{ ...stored, conversation: { user_id: "owner" } }], error: null,
    }) }) }) } as unknown as SupabaseClient;
    expect(await hydrateNumoUserMessages(client, [projected], "owner"))
      .toMatchObject([{ content: "Private prompt",
        context: { page: "Private page" },
        metadata: { file: "Private filename" } }]);
    await expect(hydrateNumoUserMessages(client, [projected], "other"))
      .rejects.toThrow("owner changed");
    await expect(hydrateNumoUserMessages(client,
      [{ ...projected, content: `${stored.content}x` }], "owner"))
      .rejects.toThrow("access changed");
  });
});
