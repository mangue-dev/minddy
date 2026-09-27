import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./store";

const h = vi.hoisted(() => ({ service: null as unknown,
  rootReady: true, cryptoReady: true }));
const key = Buffer.alloc(32, 71);
const store = new EncryptedStore({
  current: async () => {
    if (!h.cryptoReady) throw new Error("Unable to unwrap project key");
    return { version: 1, bytes: Buffer.from(key) };
  },
  byVersion: async (_scope, version) => {
    if (!h.cryptoReady) throw new Error("Unable to unwrap project key");
    return { version, bytes: Buffer.from(key) };
  },
});
vi.mock("./registry", () => ({ getEncryptedStore: () => store }));
vi.mock("./local-key-wrapper", () => ({ hasDataRootKey: () => h.rootReady }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => h.service }));
const { backfillForgeAttachmentsBatch } = await import("./forge-attachment-backfill");
const { decodeAttachmentObject } = await import("./attachment-object-content");

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
    rpc: async (name: string) => {
      if (name === "activate_forge_attachment_encryption") {
        activated = true;
        return { data: true, error: null };
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
      remove: async (paths: string[]) => { paths.forEach((path) => objects.delete(path));
        return { error: null }; },
    }) },
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (table !== "forge_attachment_objects") return { error: { message: "wrong table" } };
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

beforeEach(() => { h.service = null; h.rootReady = true; h.cryptoReady = true; });

describe("forge attachment migration", () => {
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
