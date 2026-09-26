import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 29);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { encodeAgentCheckpoint, decodeAgentCheckpoint } = await import("./run-checkpoint-content");

describe("agent checkpoint content", () => {
  it("protects resumed messages in the run and its SQL runtime copy", async () => {
    const checkpoint = { messages: [{ role: "user", content: "Private resumed request" }] };
    const encoded = await encodeAgentCheckpoint("project-1", "run-1", checkpoint as never);
    const run = { id: "run-1", project_id: "project-1", ...encoded };
    const runtimeCopy = { ...encoded };
    expect(JSON.stringify([run, runtimeCopy])).not.toContain("Private resumed request");
    await expect(decodeAgentCheckpoint(run)).resolves.toMatchObject({ checkpoint });
    await expect(decodeAgentCheckpoint({ ...run, id: "run-2" })).rejects.toThrow();
    await expect(decodeAgentCheckpoint({ ...run, project_id: "project-2" })).rejects.toThrow();
  });

  it("clears a finished checkpoint without keeping its ciphertext", async () => {
    expect(await encodeAgentCheckpoint("project-1", "run-1", null)).toEqual({
      checkpoint: null, checkpoint_ciphertext: null, checkpoint_encryption_version: 0,
    });
  });
});
