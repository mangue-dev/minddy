import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 83);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));
const { encodeAttachmentValue, decodeAttachmentValue, decodeAttachmentRow } =
  await import("./attachment-content");

describe("attachment metadata envelopes", () => {
  it("separates file name, URL, icon and page file by row and project", async () => {
    const value = "Private issue URL or filename";
    const fileName = await encodeAttachmentValue("attachments", "project-1",
      "attachment-1", "file_name", value);
    const url = await encodeAttachmentValue("attachments", "project-1",
      "attachment-1", "url", value);
    expect(fileName).not.toContain(value);
    expect(url).not.toContain(value);
    expect(await decodeAttachmentRow("attachments", { id: "attachment-1",
      project_id: "project-1", file_name: fileName, url })).toMatchObject({
        file_name: value, url: value,
      });
    await expect(decodeAttachmentValue("attachments", "project-2",
      "attachment-1", "file_name", fileName)).rejects.toThrow();
    await expect(decodeAttachmentValue("attachments", "project-1",
      "attachment-2", "file_name", fileName)).rejects.toThrow();
    await expect(decodeAttachmentValue("page_files", "project-1",
      "attachment-1", "file_name", fileName)).rejects.toThrow();
  });
});
