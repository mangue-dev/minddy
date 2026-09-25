import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore, type DataKeyProvider } from "./encryption/store";

const holder = vi.hoisted(() => ({ store: null as EncryptedStore | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => holder.store,
}));

const { encodeProject, decodeProject, decodeProjectName,
  projectContentValues } = await import("./project-content");

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

describe("project content", () => {
  it("clears source, configuration and embedded name projections", async () => {
    const id = randomUUID();
    const plain = { id, owner_id: randomUUID(), key: "PRV",
      name: "Private project roadmap",
      automations: [{ prompt: "Secret automation instructions" }],
      smart_assign_rules: { [randomUUID()]: "Secret member specialty" },
      icon_url: `/api/projects/${id}/icon/content?v=1` };
    const stored = await encodeProject(plain, { force: true });
    expect(projectContentValues(stored)).toMatchObject({ name: null,
      automations: null, smart_assign_rules: null, encryption_version: 1 });
    for (const secret of [plain.name, "Secret automation instructions",
      "Secret member specialty"]) {
      expect(JSON.stringify(stored)).not.toContain(secret);
    }
    const decoded = await decodeProject(stored, plain.owner_id);
    expect(decoded.name).toBe(plain.name);
    expect(decoded.automations).toEqual(plain.automations);
    expect(decoded.smart_assign_rules).toEqual(plain.smart_assign_rules);
    expect(await decodeProjectName(stored, plain.owner_id)).toBe(plain.name);
    await expect(decodeProject({ ...stored, id: randomUUID() }))
      .rejects.toThrow();
    await expect(decodeProjectName({ ...stored, id: randomUUID() }))
      .rejects.toThrow();
  });

  it("rejects an external icon reference during sealing", async () => {
    await expect(encodeProject({ id: randomUUID(), owner_id: randomUUID(),
      name: "Private project", automations: [], smart_assign_rules: {},
      icon_url: "https://example.test/icon.png" }, { force: true }))
      .rejects.toThrow("icon");
  });
});
