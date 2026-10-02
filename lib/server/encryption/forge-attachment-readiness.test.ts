import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./store";

const h = vi.hoisted(() => ({ service: null as unknown, version: 1, wrongKey: false }));
const store = new EncryptedStore({
  current: async () => { throw new Error("Readiness must not create keys"); },
  byVersion: async (_scope, version) => ({ version,
    bytes: Buffer.alloc(32, h.wrongKey ? 99 : version) }),
});
const encoding = new EncryptedStore({
  current: async () => ({ version: h.version, bytes: Buffer.alloc(32, h.version) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.alloc(32, version) }),
});
let encode = false;
vi.mock("./registry", () => ({ getEncryptedStore: () => encode ? encoding : store }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => h.service }));
const { encodeAttachmentObject } = await import("./attachment-object-content");
const { verifyForgeAttachmentReadiness } = await import("./forge-attachment-readiness");
const id = "22222222-2222-4222-8222-222222222222";
const project = "33333333-3333-4333-8333-333333333333";
const path = `projects/${project}/forge/${id}/${id}`;

async function fixture() {
  encode = true;
  const bytes = await encodeAttachmentObject(path, Buffer.from("synthetic private fixture"));
  encode = false;
  const row = { id, project_id: project, storage_path: path, content_key_version: 1,
    format_version: 4, rotation_checked_at: "2026-09-29T00:00:00Z",
    verified_object_digest: createHash("sha256").update(bytes).digest("hex") };
  const state = { row, bytes: bytes as Buffer | null, conflict: false,
    metadataReady: true, key: 1 as number | null, mutations: 0 };
  h.service = {
    rpc: async (name: string) => {
      expect(name).toBe("forge_attachment_migration_complete");
      return { data: state.metadataReady, error: null };
    },
    from: (table: string) => {
      const request = {
        select: () => request, eq: () => request, gt: () => request, order: () => request,
        limit: async () => ({ data: [{ ...row }], error: null }),
        maybeSingle: async () => ({ data: table === "envelope_data_keys"
          ? state.key === null ? null : { version: state.key }
          : { ...row, storage_path: state.conflict ? "changed" : row.storage_path }, error: null }),
        insert: () => { state.mutations++; throw new Error("Unexpected mutation"); },
      };
      return request;
    },
    storage: { from: () => ({ download: async () => ({ data: state.bytes
      ? new Blob([Uint8Array.from(state.bytes)]) : null,
    error: state.bytes ? null : { message: "missing" } }) }) },
  };
  return state;
}
beforeEach(() => { h.version = 1; h.wrongKey = false; encode = false; });

describe("forge attachment application readiness", () => {
  it("authenticates observed current bytes without creating a key", async () => {
    const state = await fixture();
    expect(await verifyForgeAttachmentReadiness()).toMatchObject({ ready: true, scanned: 1, blocked: 0 });
    expect(state.mutations).toBe(0);
  });
  it.each(["missing", "clear", "truncated", "wrong-key", "historical", "missing-key", "conflict", "digest", "unverified"])(
    "rejects %s bytes even when SQL metadata reports complete", async (damage) => {
      const state = await fixture();
      if (damage === "missing") state.bytes = null;
      if (damage === "clear") state.bytes = Buffer.from("private fixture");
      if (damage === "truncated") state.bytes = state.bytes!.subarray(0, 40);
      if (damage === "wrong-key") h.wrongKey = true;
      if (damage === "historical") state.key = 2;
      if (damage === "missing-key") state.key = null;
      if (damage === "conflict") state.conflict = true;
      if (damage === "digest") state.row.verified_object_digest = "0".repeat(64);
      if (damage === "unverified") state.row.rotation_checked_at = "";
      expect(await verifyForgeAttachmentReadiness()).toMatchObject({ ready: false, blocked: 1 });
      expect(state.mutations).toBe(0);
    });
});
