import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./store";

const key = Buffer.alloc(32, 67);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("./registry", () => ({ getEncryptedStore: () => store }));
const { encodeAttachmentObject, decodeAttachmentObject, attachmentObjectMetadata,
  attachmentObjectFormatVersion } =
  await import("./attachment-object-content");

describe("private attachment object envelopes", () => {
  it("rejects a removed final chunk even when the declared length is shortened", async () => {
    const path = "projects/project-1/object-1";
    const encoded = await encodeAttachmentObject(path, Buffer.alloc(8 * 1024 * 1024 + 5, 91));
    const newline = encoded.indexOf(10);
    const payload = JSON.parse(encoded.subarray(newline + 1).toString("utf8"));
    payload.chunks.pop();
    payload.length = 8 * 1024 * 1024;
    const forged = Buffer.from(encoded.subarray(0, newline + 1).toString("utf8") +
      JSON.stringify(payload));
    await expect(decodeAttachmentObject(path, forged)).rejects.toThrow();
  }, 30_000);

  it("rejects reordered and cross-generation chunks", async () => {
    const path = "projects/project-1/object-1";
    const first = await encodeAttachmentObject(path, Buffer.alloc(8 * 1024 * 1024 + 5, 91));
    const second = await encodeAttachmentObject(path, Buffer.alloc(8 * 1024 * 1024 + 5, 92));
    const newline = first.indexOf(10);
    const parse = (value: Buffer) => JSON.parse(value.subarray(newline + 1).toString("utf8"));
    const a = parse(first);
    const b = parse(second);
    a.chunks.reverse();
    await expect(decodeAttachmentObject(path, Buffer.from(first.subarray(0, newline + 1)
      .toString("utf8") + JSON.stringify(a)))).rejects.toThrow();
    a.chunks.reverse();
    a.chunks[1] = b.chunks[1];
    await expect(decodeAttachmentObject(path, Buffer.from(first.subarray(0, newline + 1)
      .toString("utf8") + JSON.stringify(a)))).rejects.toThrow();
  }, 30_000);
  it("recovers a multi-chunk file only under its project and opaque path", async () => {
    const bytes = Buffer.alloc(8 * 1024 * 1024 + 5, 91);
    bytes.write("Private issue file");
    const path = "projects/project-1/object-1";
    const encoded = await encodeAttachmentObject(path, bytes);
    expect(attachmentObjectFormatVersion(encoded)).toBe(4);
    expect(attachmentObjectMetadata(encoded)).toEqual({
      format_version: 4, content_key_version: 1,
    });
    expect(encoded.includes(Buffer.from("Private issue file"))).toBe(false);
    expect(await decodeAttachmentObject(path, encoded)).toEqual(bytes);
    await expect(decodeAttachmentObject("projects/project-2/object-1", encoded))
      .rejects.toThrow();
    await expect(decodeAttachmentObject("projects/project-1/object-2", encoded))
      .rejects.toThrow();
  }, 30_000);

  it("reads historical v3 objects for rotation", async () => {
    const path = "projects/project-1/object-1";
    const chunk = await store.encryptBytes(Buffer.from("legacy"), {
      scope: { kind: "project", id: "project-1" }, table: "attachment_objects",
      column: "bytes", rowId: `${path}:0`,
    });
    const encoded = Buffer.from("minddy-attachment-object-v3\n" +
      JSON.stringify({ length: 6, chunks: [chunk] }));
    expect(attachmentObjectFormatVersion(encoded)).toBe(3);
    expect(await decodeAttachmentObject(path, encoded)).toEqual(Buffer.from("legacy"));
  });
});
