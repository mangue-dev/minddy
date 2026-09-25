import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
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

import { decodeNumoFinalMessage, decodeNumoTurnOutcome,
  encodeNumoFinalMessage, encodeNumoTurnOutcome,
  hydrateNumoFinalMessages, numoFinalMessageState,
  numoTurnOutcomeState } from "./final-content";

describe("durable Numo final results", () => {
  it("hides the final message and turn outcome under separate row bindings", async () => {
    const clear = { content: "Private final answer", context: null,
      metadata: { reasoning: "Private reasoning" },
      tool_call_id: null, tool_name: null };
    const message = await encodeNumoFinalMessage("owner", "message", clear);
    const outcome = await encodeNumoTurnOutcome("owner", "turn", clear.content);
    expect(JSON.stringify(message)).not.toContain("Private");
    expect(outcome).not.toContain("Private");
    expect(numoFinalMessageState(message.content)).toEqual({ version: 2, format: 3 });
    expect(numoTurnOutcomeState(outcome!)).toEqual({ version: 2, format: 3 });
    expect(await decodeNumoFinalMessage("owner", message)).toMatchObject(clear);
    expect(await decodeNumoTurnOutcome("owner", "turn", outcome)).toBe(clear.content);
    await expect(decodeNumoFinalMessage("other", message)).rejects.toThrow();
    await expect(decodeNumoFinalMessage("owner", { ...message, id: "other" }))
      .rejects.toThrow();
    await expect(decodeNumoTurnOutcome("owner", "other", outcome)).rejects.toThrow();
  });

  it("hydrates a final projection only after its source and owner match", async () => {
    const stored = await encodeNumoFinalMessage("owner", "message", {
      content: "Private answer", context: null, metadata: { detail: "Private" },
      tool_call_id: null, tool_name: null,
    });
    const projected = { ...stored, source: "assistant", role: "assistant",
      tool_calls: null };
    const client = { from: () => ({ select: () => ({ in: async () => ({
      data: [{ ...stored, conversation: { user_id: "owner" } }], error: null,
    }) }) }) } as unknown as SupabaseClient;
    expect(await hydrateNumoFinalMessages(client, [projected], "owner"))
      .toMatchObject([{ content: "Private answer",
        metadata: { detail: "Private" } }]);
    await expect(hydrateNumoFinalMessages(client, [projected], "other"))
      .rejects.toThrow("owner changed");
    await expect(hydrateNumoFinalMessages(client,
      [{ ...projected, content: `${stored.content}x` }], "owner"))
      .rejects.toThrow("access changed");
  });
});
