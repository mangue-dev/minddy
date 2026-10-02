import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore, type DataKeyProvider } from "./encryption/store";

const holder = vi.hoisted(() => ({ store: null as EncryptedStore | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => holder.store,
}));

const { encodeRoutine, decodeRoutine, decodeRoutineTitle } =
  await import("./routine-content");

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

describe("agent routine content", () => {
  it("clears source and notification projection and binds to its project", async () => {
    const plain = { id: randomUUID(), project_id: randomUUID(),
      owner_id: randomUUID(), title: "Private routine",
      prompt: "Investigate secret customer", prompt_mentions: [
        { label: "secret customer", id: randomUUID() }],
      base_branch: "private-branch", last_error: "old private error" };
    const sealed = await encodeRoutine(plain, { force: true });
    for (const field of ["title","prompt","prompt_mentions","base_branch"]) {
      expect(sealed[field]).toBeNull();
    }
    expect(sealed.last_error).toBe("launchFailed");
    expect(JSON.stringify(sealed)).not.toContain("Private routine");
    expect(JSON.stringify(sealed)).not.toContain("secret customer");
    expect(JSON.stringify(sealed)).not.toContain("private-branch");
    const decoded = await decodeRoutine(sealed, plain.owner_id);
    expect(decoded.title).toBe(plain.title);
    expect(decoded.prompt).toBe(plain.prompt);
    expect(decoded.prompt_mentions).toEqual(plain.prompt_mentions);
    expect(await decodeRoutineTitle(sealed, plain.owner_id)).toBe(plain.title);
    await expect(decodeRoutine({ ...sealed, project_id: randomUUID() }))
      .rejects.toThrow();
  });
});
