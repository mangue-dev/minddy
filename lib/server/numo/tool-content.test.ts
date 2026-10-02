import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EncryptedStore } from "@/lib/server/encryption/store";

const material = Buffer.alloc(32, 97);
const indexMaterial = Buffer.alloc(32, 109);
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => new EncryptedStore({
    current: async () => ({ version: 2,bytes: Buffer.from(material) }),
    byVersion: async (_scope: unknown, version: number) => {
      if (version !== 2) throw new Error("Unknown content key");
      return { version,bytes: Buffer.from(material) };
    },
  }),
  getBlindIndexKeys: () => ({
    current: async () => ({ version: 1,bytes: Buffer.from(indexMaterial) }),
    byVersion: async (_scope: unknown, version: number) => {
      if (version !== 1) throw new Error("Unknown index key");
      return { version,bytes: Buffer.from(indexMaterial) };
    },
  }),
}));

import { decodeNumoCheckpoint, decodeNumoToolMessage,
  encodeNumoCheckpoint, encodeNumoToolMessage, hydrateNumoToolMessages } from
  "./tool-content";
import { decodeNumoToolOperationValue, encodeNumoToolOperationValue,
  numoToolArgumentsDigest } from "./tool-operation-content";

describe("durable Numo tool content", () => {
  it("seals a tool round, result and checkpoint with distinct bindings", async () => {
    const round = await encodeNumoToolMessage("owner","message",{
      role:"assistant",content:"Private reasoning",
      tool_calls:[{ id:"call-1",function:{ arguments:"Private issue" } }],
      context:{ url:"Private URL" },metadata:{ reasoning:"Private thought" },
    });
    const result = await encodeNumoToolMessage("owner","result",{
      role:"tool",content:"Private result",tool_calls:null,context:null,
      metadata:{ raw:"Private metadata" },
    });
    const checkpoint = await encodeNumoCheckpoint("owner","turn",{
      phase:"tools",assistantContent:"Private reasoning",
      pendingToolCalls:[{ id:"call-1",args:"Private issue" }],
    });
    expect(JSON.stringify([round,result,checkpoint])).not.toContain("Private");
    expect(round.tool_calls).toBeNull();
    expect(result.metadata).toEqual({});
    expect(Object.keys(checkpoint)).toEqual([
      "phase","encrypted_payload","encryption_version"]);
    expect(await decodeNumoToolMessage("owner",{
      ...round,role:"assistant" })).toMatchObject({
      content:"Private reasoning",metadata:{ reasoning:"Private thought" },
    });
    expect(await decodeNumoToolMessage("owner",{
      ...result,role:"tool" })).toMatchObject({ content:"Private result" });
    expect(await decodeNumoCheckpoint("owner","turn",checkpoint))
      .toMatchObject({ phase:"tools",assistantContent:"Private reasoning" });
    await expect(decodeNumoCheckpoint("owner","other",checkpoint)).rejects.toThrow();
    await expect(decodeNumoToolMessage("other",{
      ...round,role:"assistant" })).rejects.toThrow();
  });

  it("hydrates only the invoker-visible source row", async () => {
    const stored = await encodeNumoToolMessage("owner","message",{
      role:"tool",content:"Private result",tool_calls:null,context:null,
      metadata:{ private:"Private detail" },
    });
    const source = { ...stored,role:"tool" as const,
      conversation:{ user_id:"owner" } };
    const client = { from: () => ({ select: () => ({ in: async () => ({
      data:[source],error:null,
    }) }) }) } as unknown as SupabaseClient;
    const projected = { ...stored,role:"tool",source:"assistant" };
    expect(await hydrateNumoToolMessages(client,[projected],"owner"))
      .toMatchObject([{ content:"Private result",
        metadata:{ private:"Private detail" } }]);
    await expect(hydrateNumoToolMessages(client,[projected],"other"))
      .rejects.toThrow("owner changed");
    await expect(hydrateNumoToolMessages(client,[{
      ...projected,content:`${stored.content}x`,
    }],"owner")).rejects.toThrow("access changed");
  });

  it("uses a stable argument digest and independently bound encrypted results", async () => {
    const first = await numoToolArgumentsDigest("owner",{
      b:2,a:{ y:3,x:1 },
    });
    expect(await numoToolArgumentsDigest("owner",{
      a:{ x:1,y:3 },b:2,
    })).toBe(first);
    expect(await numoToolArgumentsDigest("other",{
      a:{ x:1,y:3 },b:2,
    })).not.toBe(first);
    const sealed = await encodeNumoToolOperationValue("owner","turn", "call",
      "result",{ answer:"Private issue result" });
    expect(JSON.stringify(sealed)).not.toContain("Private");
    expect(await decodeNumoToolOperationValue("owner","turn","call",
      "result",sealed.value,sealed.version)).toEqual({
        answer:"Private issue result",
      });
    await expect(decodeNumoToolOperationValue("owner","turn","other",
      "result",sealed.value,sealed.version)).rejects.toThrow();
    await expect(decodeNumoToolOperationValue("owner","turn","call",
      "arguments",sealed.value,sealed.version)).rejects.toThrow();
  });
});
