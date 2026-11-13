import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EncryptedStore } from "./encryption/store";

const secret = randomBytes(32);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(secret) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(secret) }),
});
vi.mock("./encryption/registry", () => ({ getEncryptedStore: () => store }));

import { decodeNumoNote, encodeNumoNote } from "./numo-note-content";

afterEach(() => vi.unstubAllEnvs());

const PROJECT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const note = () => ({
  id: "33333333-3333-4333-8333-333333333333",
  project_id: PROJECT,
  user_id: USER,
  numo_turn_id: null,
  title: "Release blocked",
  body: "The migration check failed on the release branch.",
});

describe("Numo note content", () => {
  it("seals the title and body under the project's key", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    const saved = await encodeNumoNote(note());
    expect(saved.title).toBeNull();
    expect(saved.body).toBeNull();
    expect(saved.encryption_version).toBe(1);
    expect(JSON.stringify(saved)).not.toContain("migration check");
    expect(await decodeNumoNote(saved, USER)).toEqual({
      title: "Release blocked",
      body: "The migration check failed on the release branch.",
    });
  });

  it("refuses a sealed note moved to another project or row", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    const saved = await encodeNumoNote(note());
    await expect(decodeNumoNote({ ...saved,
      project_id: "44444444-4444-4444-8444-444444444444" }, USER)).rejects.toThrow();
    await expect(decodeNumoNote({ ...saved,
      id: "55555555-5555-4555-8555-555555555555" }, USER)).rejects.toThrow();
  });

  it("writes clear text only while project content is unprotected", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    vi.stubEnv("MINDDY_DATA_ROOT_KEY", "");
    const saved = await encodeNumoNote(note());
    expect(saved).toMatchObject({ title: "Release blocked", encryption_version: 0,
      encrypted_content: null });
    expect((await decodeNumoNote(saved)).title).toBe("Release blocked");
  });

  it("seals a personal note under its user's key (MIN-982)", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    const saved = await encodeNumoNote({ ...note(), project_id: null });
    expect(saved.encryption_version).toBe(1);
    expect(JSON.stringify(saved)).not.toContain("migration check");
    expect((await decodeNumoNote(saved, USER)).title).toBe("Release blocked");
    // Moved to a project, or to another user, it no longer opens.
    await expect(decodeNumoNote({ ...saved, project_id: PROJECT }, USER)).rejects.toThrow();
    await expect(decodeNumoNote({ ...saved,
      user_id: "44444444-4444-4444-8444-444444444444" }, USER)).rejects.toThrow();
  });

  it("writes a personal note in clear only while user content encryption is off", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    const saved = await encodeNumoNote({ ...note(), project_id: null });
    expect(saved).toMatchObject({ title: "Release blocked", encryption_version: 0, encrypted_content: null });
  });

  it("rejects an empty note", async () => {
    await expect(encodeNumoNote({ ...note(), body: "  " })).rejects.toThrow();
  });
});
