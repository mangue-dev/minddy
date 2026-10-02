import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./store";

const h = vi.hoisted(() => ({ service: null as unknown,
  rootReady: true, cryptoReady: true, version: 1, conflict: false,
  removeFails: false, wrongKey: false }));
const store = new EncryptedStore({
  current: async () => {
    if (!h.cryptoReady) throw new Error("Unable to unwrap project key");
    return { version: h.version, bytes: Buffer.alloc(32, h.version + 70) };
  },
  byVersion: async (_scope, version) => {
    if (!h.cryptoReady) throw new Error("Unable to unwrap project key");
    return { version, bytes: h.wrongKey ? Buffer.alloc(32, 99) : Buffer.alloc(32, version + 70) };
  },
});
vi.mock("./registry", () => ({ getEncryptedStore: () => store }));
vi.mock("./local-key-wrapper", () => ({ hasDataRootKey: () => h.rootReady }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => h.service }));
const { backfillForgeAttachmentsBatch } = await import("./forge-attachment-backfill");
const { decodeAttachmentObject, encodeAttachmentObject } = await import("./attachment-object-content");

const PR = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const oldPath = `${PR}/${ID}/human-name.png`;

function fixture() {
  const objects = new Map<string, Buffer>([[oldPath, Buffer.from("private sentinel")]]);
  const rows = new Map<string, Record<string, unknown>>();
  let uploads = 0;
  let activated = false;
  const service = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "activate_forge_attachment_encryption") {
        activated = true;
        return { data: true, error: null };
      }
      if (name === "verify_forge_attachment_legacy_cleanup") {
        const match = [...rows.values()].find((row) => row.storage_path === args.p_expected_path);
        return { data: !!match && !h.conflict, error: null };
      }
      return { data: objects.has(oldPath) ? [{
        name: oldPath, pr_id: PR, project_id: PROJECT,
        migrated_path: [...rows.values()][0]?.storage_path ?? null,
      }] : [], error: null };
    },
    storage: { from: () => ({
      download: async (path: string) => ({
        data: objects.has(path) ? new Blob([Uint8Array.from(objects.get(path)!)],
          { type: path === oldPath ? "image/png" : "application/octet-stream" }) : null,
        error: objects.has(path) ? null : { message: "missing" },
      }),
      upload: async (path: string, bytes: Uint8Array) => {
        if (!activated) return { error: { message: "writer fence absent" } };
        uploads++;
        objects.set(path, Buffer.from(bytes));
        return { error: null };
      },
      remove: async (paths: string[]) => {
        if (h.removeFails && paths.includes(oldPath)) return { error: { message: "interrupted" } };
        paths.forEach((path) => objects.delete(path));
        return { error: null }; },
    }) },
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (table !== "forge_attachment_objects") return { error: { message: "wrong table" } };
        if ([...rows.values()].some((stored) => stored.legacy_path_digest === row.legacy_path_digest)) {
          return { error: { message: "duplicate legacy binding" } };
        }
        rows.set(String(row.id), row);
        return { error: null };
      },
      upsert: async () => ({ error: null }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  };
  h.service = service;
  return { objects, rows, uploads: () => uploads,
    activated: () => activated };
}

beforeEach(() => { h.service = null; h.rootReady = true; h.cryptoReady = true;
  h.version = 1; h.conflict = false; h.removeFails = false; h.wrongKey = false; });

describe("forge attachment migration", () => {
  it.each(["missing", "clear", "truncated", "corrupt", "wrong-key", "missing-key", "different"])(
    "preserves the recoverable source when a resumed replacement is %s", async (damage) => {
      const state = fixture();
      const path = `projects/${PROJECT}/forge/${ID}/${ID}`;
      let sealed = await encodeAttachmentObject(path, Buffer.from(
        damage === "different" ? "different content" : "private sentinel"));
      if (damage === "clear") sealed = Buffer.from("private sentinel");
      if (damage === "truncated") sealed = sealed.subarray(0, sealed.length - 20);
      if (damage === "corrupt") {
        const payload = JSON.parse(sealed.subarray(sealed.indexOf(10) + 1).toString());
        const manifest = JSON.parse(payload.manifest);
        manifest.tag = Buffer.alloc(16).toString("base64");
        payload.manifest = JSON.stringify(manifest);
        sealed = Buffer.from("minddy-attachment-object-v4\n" + JSON.stringify(payload));
      }
      if (damage !== "missing") state.objects.set(path, sealed);
      state.rows.set(ID, { id: ID, storage_path: path });
      if (damage === "wrong-key") h.wrongKey = true;
      if (damage === "missing-key") h.cryptoReady = false;
      expect(await backfillForgeAttachmentsBatch()).toMatchObject({ migrated: 0, failed: 1 });
      expect(state.objects.get(oldPath)).toEqual(Buffer.from("private sentinel"));
    });
  it("keeps one recoverable encrypted winner when two workers rewrite the same source", async () => {
    const state = fixture();
    const results = await Promise.all([backfillForgeAttachmentsBatch(), backfillForgeAttachmentsBatch()]);
    expect(results.reduce((sum, result) => sum + result.migrated, 0)).toBe(1);
    expect(state.rows.size).toBe(1);
    expect(state.objects.size).toBe(1);
    const row = [...state.rows.values()][0];
    expect(await decodeAttachmentObject(String(row.storage_path),
      state.objects.get(String(row.storage_path))!)).toEqual(Buffer.from("private sentinel"));
  });
  it("retries an interrupted registered rewrite with its historical key", async () => {
    const state = fixture();
    h.removeFails = true;
    expect(await backfillForgeAttachmentsBatch()).toMatchObject({ migrated: 0, failed: 1 });
    expect(state.rows.size).toBe(1);
    expect(state.objects.has(oldPath)).toBe(true);
    h.removeFails = false;
    h.version = 2;
    expect(await backfillForgeAttachmentsBatch()).toMatchObject({ migrated: 1, failed: 0 });
    expect(state.uploads()).toBe(1);
    expect(state.objects.has(oldPath)).toBe(false);
  });
  it("preserves both objects when a cleanup reference CAS conflicts", async () => {
    const state = fixture();
    h.conflict = true;
    expect(await backfillForgeAttachmentsBatch()).toMatchObject({ migrated: 0, failed: 1 });
    expect(state.objects.has(oldPath)).toBe(true);
    expect(state.objects.size).toBe(2);
    h.conflict = false;
    expect(await backfillForgeAttachmentsBatch()).toMatchObject({ migrated: 1, failed: 0 });
  });
  it("keeps a source through independently restored SQL and Storage batches", async () => {
    const state = fixture();
    const path = `projects/${PROJECT}/forge/${ID}/${ID}`;
    const sealed = await encodeAttachmentObject(path, Buffer.from("private sentinel"));
    state.rows.set(ID, { id: ID, storage_path: path });
    expect(await backfillForgeAttachmentsBatch()).toMatchObject({ failed: 1 });
    expect(state.objects.has(oldPath)).toBe(true);
    state.objects.set(path, sealed);
    expect(await backfillForgeAttachmentsBatch()).toMatchObject({ migrated: 1 });
    state.objects.set(oldPath, Buffer.from("private sentinel"));
    state.rows.clear();
    expect(await backfillForgeAttachmentsBatch()).toMatchObject({ migrated: 1 });
    expect(state.objects.has(oldPath)).toBe(false);
  });
  it("encrypts, verifies and removes the historical clear object", async () => {
    const state = fixture();
    expect(await backfillForgeAttachmentsBatch(10)).toEqual({
      scanned: 1, migrated: 1, failed: 0,
    });
    expect(state.objects.has(oldPath)).toBe(false);
    expect(state.activated()).toBe(true);
    const row = [...state.rows.values()][0];
    expect(row.legacy_path_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(row.storage_path).not.toContain("human-name");
    const stored = state.objects.get(String(row.storage_path))!;
    expect(stored.includes(Buffer.from("private sentinel"))).toBe(false);
    expect(await decodeAttachmentObject(String(row.storage_path), stored))
      .toEqual(Buffer.from("private sentinel"));
    expect(await backfillForgeAttachmentsBatch(10)).toMatchObject({ scanned: 0 });
    expect(state.uploads()).toBe(1);
  });

  it("installs the durable writer fence even when no upload has occurred", async () => {
    const state = fixture();
    state.objects.delete(oldPath);
    expect(await backfillForgeAttachmentsBatch(10)).toEqual({
      scanned: 0, migrated: 0, failed: 0,
    });
    expect(state.activated()).toBe(true);
  });

  it("does not fence writers when crypto preparation fails", async () => {
    const state = fixture();
    h.rootReady = false;
    await expect(backfillForgeAttachmentsBatch(10))
      .rejects.toThrow("root key is unavailable");
    expect(state.activated()).toBe(false);
    expect(state.uploads()).toBe(0);
  });

  it("does not install the fence when a project key cannot be unwrapped", async () => {
    const state = fixture();
    h.cryptoReady = false;
    await expect(backfillForgeAttachmentsBatch(10))
      .rejects.toThrow("Unable to unwrap project key");
    expect(state.activated()).toBe(false);
    expect(state.uploads()).toBe(0);
  });
});
