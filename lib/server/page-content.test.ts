import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore, type DataKeyProvider } from "./encryption/store";

const holder = vi.hoisted(() => ({ store: null as EncryptedStore | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => holder.store,
}));

const { encodePage, decodePage, decodePageProjection,
  pageContentValues } = await import("./page-content");

beforeEach(() => {
  const root = randomBytes(32);
  const keys: DataKeyProvider = {
    current: async () => ({ version: 1, bytes: Buffer.from(root) }),
    byVersion: async (_scope, version) =>
      ({ version, bytes: Buffer.from(root) }),
  };
  holder.store = new EncryptedStore(keys);
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("page content", () => {
  it("seals the document, database cells and search projection together", async () => {
    const row = { id: randomUUID(), project_id: randomUUID(),
      title: "Private product roadmap", icon: "🔒",
      content: { type: "doc", content: [{ type: "paragraph",
        content: [{ type: "text", text: "Private body" }] }] },
      database_schema: [{ id: randomUUID(), name: "Private column",
        type: "text" }],
      database_title_name: "Private title column",
      property_values: { secret: "Private cell" },
      search_text: "Private body", search_tsv: "private",
      content_revision: 0, database_revision: 0, version: 1 };
    const stored = await encodePage(row, { force: true });
    expect(pageContentValues(stored)).toMatchObject({ title: null,
      icon: null, content: null, database_schema: null,
      database_title_name: null, property_values: null,
      search_text: null, encryption_version: 1 });
    expect(stored).not.toHaveProperty("search_tsv");
    for (const secret of ["Private product roadmap", "Private body",
      "Private column", "Private title column", "Private cell"]) {
      expect(JSON.stringify(stored)).not.toContain(secret);
    }
    const clear = await decodePage(stored);
    expect(clear.title).toBe(row.title);
    expect(clear.content).toEqual(row.content);
    expect(clear.property_values).toEqual(row.property_values);
    const projected = await decodePageProjection<Record<string, unknown>>({ id: row.id,
      project_id: row.project_id, title: null,
      encrypted_content: stored.encrypted_content,
      encryption_version: stored.encryption_version });
    expect(projected.title).toBe(row.title);
    expect(projected.content).toEqual(row.content);
    await expect(decodePage({ ...stored, id: randomUUID() }))
      .rejects.toThrow();
    await expect(decodePage({ ...stored, page_has_values: false }))
      .rejects.toThrow("metadata mismatch");
    await expect(decodePageProjection({ ...stored, title: "old writer" }))
      .rejects.toThrow("retains plaintext");
  });
});
