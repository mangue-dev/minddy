import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./store";

const key = Buffer.alloc(32, 67);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("./registry", () => ({ getEncryptedStore: () => store }));
const { encodeAttachmentObject, decodeAttachmentObject } =
  await import("./attachment-object-content");

describe("private attachment object envelopes", () => {
  it("recovers a multi-chunk file only under its project and opaque path", async () => {
    const bytes = Buffer.alloc(8 * 1024 * 1024 + 5, 91);
    bytes.write("Private issue file");
    const path = "projects/project-1/object-1";
    const encoded = await encodeAttachmentObject(path, bytes);
    expect(encoded.includes(Buffer.from("Private issue file"))).toBe(false);
    expect(await decodeAttachmentObject(path, encoded)).toEqual(bytes);
    await expect(decodeAttachmentObject("projects/project-2/object-1", encoded))
      .rejects.toThrow();
    await expect(decodeAttachmentObject("projects/project-1/object-2", encoded))
      .rejects.toThrow();
  }, 30_000);
});
