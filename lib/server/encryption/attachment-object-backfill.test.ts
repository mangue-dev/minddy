import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./store";

const project = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const oldPath = `projects/${project}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`;
const newPath = `projects/${project}/cccccccc-cccc-4ccc-8ccc-cccccccccccc`;
const state = vi.hoisted(() => ({
  version: 2,
  objects: new Map<string, Buffer>(),
  registry: new Map<string, { format_version: number; content_key_version: number }>(),
  alias: new Map<string, string>(),
  swaps: [] as Array<Record<string, unknown>>,
  allowSwap: true,
  encode: null as null | ((path: string, bytes: Uint8Array) => Promise<Buffer>),
}));
const keyFor = (version: number) => Buffer.alloc(32, version === 1 ? 71 : 73);
const store = new EncryptedStore({
  current: async () => ({ version: state.version, bytes: keyFor(state.version) }),
  byVersion: async (_scope, version) => ({ version, bytes: keyFor(version) }),
});
vi.mock("./registry", () => ({
  getEncryptedStore: () => store,
  getContentKeys: () => ({
    current: async () => ({ version: state.version, bytes: keyFor(state.version) }),
  }),
}));
vi.mock("./content-config", () => ({ isContentEncryptionEnabled: () => true }));
vi.mock("@/lib/server/attachments", () => ({
  attachmentPathDigest: async () => "a".repeat(64),
  opaqueAttachmentPath: () => newPath,
  resolveAttachmentObjectPath: async (_service: unknown, path: string) =>
    state.alias.get(path) ?? path,
  uploadPrivateAttachmentObject: async (_service: unknown, path: string,
    bytes: Uint8Array) => {
    const stored = await state.encode!(path, bytes);
    state.objects.set(path, stored);
    state.registry.set(path, { format_version: 4,
      content_key_version: state.version });
  },
}));
const service = {
  rpc: async (name: string, args: Record<string, unknown>) => {
    if (name === "list_attachment_object_migration_candidates") {
      return { data: [...state.objects.keys()].filter((path) => path === oldPath)
        .map((path) => ({ id: "object-1", name: path,
          ...state.registry.get(path) })), error: null };
    }
    if (name === "record_attachment_object_migration_attempt") {
      return { data: null, error: null };
    }
    state.swaps.push({ name, ...args });
    if (!state.allowSwap) return { data: false, error: null };
    state.alias.set(oldPath, newPath);
    return { data: true, error: null };
  },
  storage: { from: () => ({
    download: async (path: string) => {
      const bytes = state.objects.get(path);
      return { data: bytes ? new Blob([Uint8Array.from(bytes)],
        { type: "application/octet-stream" }) : null,
      error: bytes ? null : { code: "not_found" } };
    },
    remove: async (paths: string[]) => {
      for (const path of paths) state.objects.delete(path);
      return { error: null };
    },
  }) },
  from: () => ({
    upsert: async (row: { path: string; format_version: number;
      content_key_version: number }) => {
      state.registry.set(row.path, row);
      return { error: null };
    },
    delete: () => ({ eq: async (_column: string, path: string) => {
      state.registry.delete(path);
      return { error: null };
    } }),
  }),
};
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));

const { encodeAttachmentObject, decodeAttachmentObject,
  attachmentObjectFormatVersion } = await import("./attachment-object-content");
const { backfillAttachmentObjectsBatch } = await import("./attachment-object-backfill");

beforeEach(async () => {
  vi.stubEnv("MINDDY_ATTACHMENT_OBJECT_ENCRYPTION_ENABLED", "true");
  state.version = 2;
  state.objects.clear();
  state.registry.clear();
  state.alias.clear();
  state.swaps = [];
  state.allowSwap = true;
  state.encode = encodeAttachmentObject;
  const clear = Buffer.from("Historical private object");
  state.version = 1;
  const chunk = await store.encryptBytes(clear, { scope: { kind: "project", id: project },
    table: "attachment_objects", column: "bytes", rowId: `${oldPath}:0` });
  state.version = 2;
  state.objects.set(oldPath, Buffer.from("minddy-attachment-object-v3\n" +
    JSON.stringify({ length: clear.length, chunks: [chunk] })));
  state.registry.set(oldPath, { format_version: 3, content_key_version: 1 });
});

describe("historical attachment object rotation", () => {
  it("verifies an immutable v4 copy before swapping references and removing v3", async () => {
    expect(await decodeAttachmentObject(oldPath, state.objects.get(oldPath)!))
      .toEqual(Buffer.from("Historical private object"));
    const outcome = await backfillAttachmentObjectsBatch();
    expect(outcome).toMatchObject({ scanned: 1, migrated: 1 });
    expect(state.swaps[0]).toMatchObject({ name: "rotate_attachment_object_references",
      p_old_path: oldPath, p_new_path: newPath, p_expected_format: 3 });
    expect(state.objects.has(oldPath)).toBe(false);
    expect(state.registry.has(oldPath)).toBe(false);
    expect(state.alias.get(oldPath)).toBe(newPath);
    const replacement = state.objects.get(newPath)!;
    expect(attachmentObjectFormatVersion(replacement)).toBe(4);
    expect(await decodeAttachmentObject(newPath, replacement))
      .toEqual(Buffer.from("Historical private object"));
  });

  it("keeps the old object and removes the new copy after a CAS conflict", async () => {
    state.allowSwap = false;
    expect(await backfillAttachmentObjectsBatch()).toMatchObject({ scanned: 1,
      migrated: 0, conflicted: 1 });
    expect(state.objects.has(oldPath)).toBe(true);
    expect(state.objects.has(newPath)).toBe(false);
  });
});
