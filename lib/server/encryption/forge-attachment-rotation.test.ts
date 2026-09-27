import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./store";

const h = vi.hoisted(() => ({ version: 1, service: null as unknown,
  conflict: false }));
const keys = {
  current: async () => ({ version: h.version,
    bytes: Buffer.alloc(32, h.version) }),
  byVersion: async (_scope: unknown, version: number) => ({ version,
    bytes: Buffer.alloc(32, version) }),
};
const store = new EncryptedStore(keys);
vi.mock("./registry", () => ({ getEncryptedStore: () => store,
  getContentKeys: () => keys }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => h.service }));
const { encodeAttachmentObject, decodeAttachmentObject } =
  await import("./attachment-object-content");
const { rotateForgeAttachmentsBatch } = await import("./forge-attachment-rotation");

const project = "33333333-3333-4333-8333-333333333333";
const id = "22222222-2222-4222-8222-222222222222";
const firstPath = `projects/${project}/forge/${id}/44444444-4444-4444-8444-444444444444`;

async function fixture() {
  const objects = new Map([[firstPath,
    await encodeAttachmentObject(firstPath, Buffer.from("private rotation sentinel"))]]);
  const row = { id, project_id: project, storage_path: firstPath,
    content_key_version: 1, format_version: 4 };
  const service = {
    from: () => {
      const request = {
        select: () => request, is: () => request, eq: () => request,
        lt: () => request,
        order: () => request, limit: async () => ({ data: [], error: null }),
      };
      return request;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "list_forge_attachment_rotation_candidates") {
        return { data: [{ ...row }], error: null };
      }
      if (name === "list_forge_attachment_orphans") return { data: [], error: null };
      if (name === "mark_forge_attachment_rotation_checked") {
        return { data: true, error: null };
      }
      if (name === "rotate_forge_attachment_reference") {
        if (h.conflict || args.p_expected_path !== row.storage_path ||
            args.p_expected_version !== row.content_key_version) {
          return { data: false, error: null };
        }
        row.storage_path = String(args.p_new_path);
        row.content_key_version = Number(args.p_new_version);
        return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
    storage: { from: () => ({
      download: async (path: string) => ({ data: objects.has(path)
        ? new Blob([Uint8Array.from(objects.get(path)!)]): null,
      error: objects.has(path) ? null : { message: "missing" } }),
      upload: async (path: string, bytes: Uint8Array) => {
        objects.set(path, Buffer.from(bytes)); return { error: null }; },
      remove: async (paths: string[]) => { paths.forEach((path) => objects.delete(path));
        return { error: null }; },
    }) },
  };
  h.service = service;
  return { objects, row };
}

beforeEach(() => { h.version = 1; h.conflict = false; });

describe("forge attachment key rotation", () => {
  it("verifies an immutable replacement before swapping the capability target", async () => {
    const { objects, row } = await fixture();
    h.version = 2;
    expect(await rotateForgeAttachmentsBatch()).toMatchObject({
      scanned: 1, rotated: 1, failed: 0,
    });
    expect(row.storage_path).not.toBe(firstPath);
    expect(row.content_key_version).toBe(2);
    expect(objects.has(firstPath)).toBe(false);
    expect(await decodeAttachmentObject(row.storage_path,
      objects.get(row.storage_path)!)).toEqual(Buffer.from("private rotation sentinel"));
  });

  it("keeps the original target on a concurrent CAS conflict", async () => {
    const { objects, row } = await fixture();
    h.version = 2;
    h.conflict = true;
    expect(await rotateForgeAttachmentsBatch()).toMatchObject({ conflicted: 1 });
    expect(row.storage_path).toBe(firstPath);
    expect(objects.has(firstPath)).toBe(true);
  });
});
