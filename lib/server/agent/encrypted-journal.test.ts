import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const content = Buffer.alloc(32, 7);
const index = Buffer.alloc(32, 9);
const store = new EncryptedStore({
  current: async () => ({ version: 2, bytes: Buffer.from(content) }),
  byVersion: async (_scope, version) => ({
    version, bytes: Buffer.from(content),
  }),
});
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => store,
  getBlindIndexKeys: () => ({
    current: async () => ({ version: 1, bytes: Buffer.from(index) }),
  }),
}));

const {
  decodeJournal, encryptJournal, journalEncodedRow,
} = await import("./encrypted-journal");

describe("encrypted agent journal", () => {
  it("protects the gzip batch and digest while preserving replay", async () => {
    const events = [{ aggregateID: "session-1", seq: 1, output: "private output" }];
    const legacy = { ...journalEncodedRow("run-1", "session-1", events), id: 4 };
    const protectedRow = await encryptJournal("project-1", legacy);
    expect(protectedRow.payload).not.toContain("private output");
    expect(protectedRow.payload).not.toContain(legacy.payload);
    expect(protectedRow.payload_sha256).not.toBe(legacy.payload_sha256);
    expect(protectedRow.encryption_version).toBe(2);
    await expect(decodeJournal("project-1", protectedRow)).resolves.toEqual({
      events, payloadBytes: legacy.payload_bytes,
    });
    await expect(decodeJournal("project-2", protectedRow)).rejects.toThrow();
    await expect(decodeJournal("project-1", {
      ...protectedRow, session_id: "session-2",
    })).rejects.toThrow();
    await expect(decodeJournal("project-1", {
      ...protectedRow, payload_sha256: "0".repeat(64),
    })).rejects.toThrow();
  });

  it("gives duplicate legacy JSON batches distinct protected identities", async () => {
    const first = { ...journalEncodedRow("run-1", "session-1", [{ seq: 1 }]), id: 1 };
    const second = { ...first, id: 2 };
    const a = await encryptJournal("project-1", first, true);
    const b = await encryptJournal("project-1", second, true);
    expect(a.payload_sha256).not.toBe(b.payload_sha256);
    await expect(decodeJournal("project-1", a)).resolves.toMatchObject({
      events: [{ seq: 1 }],
    });
  });
});
