import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore, type DataKeyProvider } from "./encryption/store";

const holder = vi.hoisted(() => ({ store: null as EncryptedStore | null,
  index: null as DataKeyProvider | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => holder.store,
  getBlindIndexKeys: () => holder.index,
}));

const { encodeSavedView, decodeSavedView, savedViewNameIndex } =
  await import("./saved-view-bookmark");

beforeEach(() => {
  const content = randomBytes(32);
  const index = randomBytes(32);
  const keys: DataKeyProvider = {
    current: async () => ({ version: 2, bytes: Buffer.from(content) }),
    byVersion: async (_scope, version) =>
      ({ version, bytes: Buffer.from(content) }),
  };
  holder.store = new EncryptedStore(keys);
  holder.index = {
    current: async () => ({ version: 2, bytes: Buffer.from(index) }),
    byVersion: async (_scope, version) =>
      ({ version, bytes: Buffer.from(index) }),
  };
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("personal saved-view bookmarks", () => {
  it("clears name and address, keeps stable equality and rejects another owner", async () => {
    const actor = randomUUID();
    const plain = { id: randomUUID(), user_id: actor,
      name: "Private sprint", href: "/issues?q=secret-plan" };
    const stored = await encodeSavedView(plain, { force: true });
    expect(stored.name).toBeNull();
    expect(stored.href).toBeNull();
    expect(stored.name_index).toBe(await savedViewNameIndex(actor, plain.name));
    expect(JSON.stringify(stored)).not.toContain("Private sprint");
    expect(JSON.stringify(stored)).not.toContain("secret-plan");
    const decoded = await decodeSavedView(stored, actor);
    expect(decoded).toMatchObject(plain);
    expect(decoded).not.toHaveProperty("name_index");
    await expect(decodeSavedView(stored, randomUUID())).rejects.toThrow();
    await expect(decodeSavedView({ ...stored, name_index: "a".repeat(64) },
      actor)).rejects.toThrow();
  });
});
