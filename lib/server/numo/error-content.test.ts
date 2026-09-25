import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const material = Buffer.alloc(32, 83);
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => new EncryptedStore({
    current: async () => ({ version: 2, bytes: Buffer.from(material) }),
    byVersion: async (_scope: unknown, version: number) => {
      if (version !== 2) throw new Error("Unknown key version");
      return { version, bytes: Buffer.from(material) };
    },
  }),
}));

import { decodeNumoError, encodeNumoError, numoErrorState } from
  "./error-content";

describe("durable Numo error copies", () => {
  it("seals each source and copy under its own owner and row binding", async () => {
    const message = "Private provider response about an issue";
    const values = await Promise.all([
      encodeNumoError("owner", "numo_assistant_turns", "turn", message),
      encodeNumoError("owner", "conversations", "conversation", message),
      encodeNumoError("owner", "numo_routine_occurrences", "occurrence", message),
    ]);
    expect(new Set(values).size).toBe(3);
    expect(JSON.stringify(values)).not.toContain(message);
    for (const [index, source] of (["numo_assistant_turns", "conversations",
      "numo_routine_occurrences"] as const).entries()) {
      expect(numoErrorState(values[index]!)).toEqual({ version: 2, format: 3 });
      expect(await decodeNumoError("owner", source,
        ["turn", "conversation", "occurrence"][index], values[index]))
        .toBe(message);
      await expect(decodeNumoError("other", source,
        ["turn", "conversation", "occurrence"][index], values[index]))
        .rejects.toThrow();
      await expect(decodeNumoError("owner", source,
        "different", values[index])).rejects.toThrow();
    }
  });
});
