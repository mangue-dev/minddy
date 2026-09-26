import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 37);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { encodeAgentVerdict, decodeAgentVerdict } = await import("./run-verdict-content");

describe("agent verdict storage", () => {
  it("removes verdict plaintext and binds the ciphertext to its run and project", async () => {
    const verdict = { ok: false, summary: "Private review conclusion", blockers: ["Secret finding"] };
    const encoded = await encodeAgentVerdict("project-1", "run-1", verdict);
    expect(encoded.verdict).toBeNull();
    expect(JSON.stringify(encoded)).not.toContain("Private review conclusion");
    const row = { id: "run-1", project_id: "project-1", ...encoded };
    await expect(decodeAgentVerdict(row)).resolves.toMatchObject({ verdict });
    await expect(decodeAgentVerdict({ ...row, id: "run-2" })).rejects.toThrow();
    await expect(decodeAgentVerdict({ ...row, project_id: "project-2" })).rejects.toThrow();
    await expect(decodeAgentVerdict({ ...row, verdict })).rejects.toThrow();
  });
});
