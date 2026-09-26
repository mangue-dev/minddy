import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore, type DataKeyProvider } from "./store";
import { EncryptedObjectCodec, MAX_PROTECTED_OBJECT_BYTES, type ObjectContext } from "./object-codec";

const context: ObjectContext = { scope: { kind: "project", id: "project-1" }, bucket: "attachments", path: "projects/project-1/opaque-id" };
const metadata = { fileName: "private-report.pdf", mimeType: "application/pdf" };
const audit = { actorId: "user-1", reason: "repository_read" as const };

function fixture() {
  const root = randomBytes(32);
  const provider: DataKeyProvider = {
    current: async () => ({ version: 1, bytes: Buffer.from(root) }),
    byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(root) }),
  };
  const store = new EncryptedStore(provider);
  return { store, codec: new EncryptedObjectCodec(store) };
}

beforeEach(() => vi.spyOn(console, "info").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("protected storage object codec", () => {
  it.each([0, 1, 1024 * 1024 - 1, 1024 * 1024, 1024 * 1024 + 1, MAX_PROTECTED_OBJECT_BYTES])(
    "round-trips %i binary bytes with authenticated private metadata", async (length) => {
      const { codec } = fixture();
      const source = Buffer.alloc(length, 0xa5);
      const ciphertext = await codec.encode(source, context, metadata);
      expect(ciphertext.toString()).not.toContain(metadata.fileName);
      expect(ciphertext.toString()).not.toContain(metadata.mimeType);
      const result = await codec.decode(codec.fromStorage(ciphertext), context, audit);
      expect(result.bytes.equals(source)).toBe(true);
      expect(result.metadata).toEqual(metadata);
      expect(source.equals(Buffer.alloc(length, 0xa5))).toBe(true);
      expect(console.info).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(metadata.fileName);
    },
  );

  it("rejects missing, reordered, appended or replaced chunks, including valid chunks from an earlier write", async () => {
    const { codec } = fixture();
    const source = Buffer.alloc(1024 * 1024 + 16, 0x61);
    const first = JSON.parse((await codec.encode(source, context, metadata)).toString());
    const second = JSON.parse((await codec.encode(source, context, metadata)).toString());
    for (const changed of [
      { ...first, chunks: first.chunks.slice(1) },
      { ...first, chunks: [...first.chunks].reverse() },
      { ...first, chunks: [...first.chunks, first.chunks[0]] },
      { ...first, chunks: [second.chunks[0], first.chunks[1]] },
    ]) {
      await expect(codec.decode(codec.fromStorage(Buffer.from(JSON.stringify(changed))), context, audit)).rejects.toThrow();
    }
    expect(console.info).not.toHaveBeenCalled();
  });

  it("refuses transplantation across paths, buckets and owners even if key material is accidentally shared", async () => {
    const { codec } = fixture();
    const value = await codec.encode(Buffer.from("confidential"), context, metadata);
    for (const changed of [
      { ...context, path: "projects/project-1/other" },
      { ...context, bucket: "project-icons" },
      { ...context, scope: { kind: "project" as const, id: "other" } },
      { ...context, scope: { kind: "user" as const, id: context.scope.id } },
    ]) await expect(codec.decode(value, changed, audit)).rejects.toThrow("Unable to decrypt");
  });

  it("fails closed for plaintext, truncated containers, invalid locations and oversized uploads", async () => {
    const { codec } = fixture();
    for (const raw of ["plain text", "{}", "null", "[]", '{"format":"unknown"}']) {
      expect(() => codec.fromStorage(Buffer.from(raw))).toThrow("Invalid protected object");
    }
    await expect(codec.encode(Buffer.alloc(MAX_PROTECTED_OBJECT_BYTES + 1), context, metadata)).rejects.toThrow("too large");
    for (const path of ["", "/absolute", "projects/../secret", "projects//id", "projects/id/", "projects\\id"]) {
      await expect(codec.encode(Buffer.alloc(1), { ...context, path }, metadata)).rejects.toThrow("location");
    }
    await expect(codec.encode(Buffer.alloc(1), context, { ...metadata, fileName: "bad\r\nheader" })).rejects.toThrow("metadata");
    const value = await codec.encode(Buffer.from("test"), context, metadata);
    expect(() => codec.fromStorage(value.subarray(0, -1))).toThrow("container");
  });

  it("authenticates a manifest before accepting its sizes or file metadata", async () => {
    const { codec, store } = fixture();
    const source = JSON.parse((await codec.encode(Buffer.from("test"), context, metadata)).toString());
    const cipher = JSON.parse(source.manifest);
    source.manifest = JSON.stringify({ ...cipher, tag: randomBytes(16).toString("base64url") });
    await expect(codec.decode(codec.fromStorage(Buffer.from(JSON.stringify(source))), context, audit)).rejects.toThrow("Unable to decrypt");
    // Even a trusted but malformed producer must not cause oversized allocation.
    source.manifest = await store.encrypt({ ...metadata, size: MAX_PROTECTED_OBJECT_BYTES + 1, parts: [] }, {
      scope: context.scope, table: "storage.objects", column: "manifest", rowId: `${context.bucket}/${context.path}`,
    });
    await expect(codec.decode(codec.fromStorage(Buffer.from(JSON.stringify(source))), context, audit)).rejects.toThrow("manifest");
  });
});
