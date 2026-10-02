import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore, type DataKeyProvider } from "./encryption/store";

const holder = vi.hoisted(() => ({ store: null as EncryptedStore | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => holder.store,
}));

const { encodeView, decodeView } = await import("./view-content");

beforeEach(() => {
  const root = randomBytes(32);
  const keys: DataKeyProvider = {
    current: async () => ({ version: 1, bytes: Buffer.from(root) }),
    byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(root) }),
  };
  holder.store = new EncryptedStore(keys);
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("saved board view content", () => {
  it.each(["project", "user"])("seals the %s view source and returns only authorized content", async (kind) => {
    const owner = randomUUID();
    const plain = { id: randomUUID(), project_id: kind === "project" ? owner : null,
      user_id: kind === "user" ? owner : null, kind: "custom",
      name: "Private roadmap", filters: { category: ["secret-category"] },
      display: { hideDone: true }, sort: "smart" };
    const stored = await encodeView(plain, { force: true });
    expect(stored.name).toBeNull();
    expect(stored.filters).toBeNull();
    expect(stored.display).toBeNull();
    expect(JSON.stringify(stored)).not.toContain("Private roadmap");
    expect(JSON.stringify(stored)).not.toContain("secret-category");
    const decoded = await decodeView(stored, owner);
    expect(decoded.name).toBe(plain.name);
    expect(decoded.filters).toEqual(plain.filters);
    expect(decoded.display).toEqual(plain.display);
    expect(decoded).not.toHaveProperty("encrypted_content");
    const transplanted = { ...stored, [kind === "project" ? "project_id" : "user_id"]:
      randomUUID() };
    await expect(decodeView(transplanted)).rejects.toThrow();
  });
});
