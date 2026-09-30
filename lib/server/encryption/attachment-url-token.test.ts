import { describe, expect, it, vi } from "vitest";

const key = Buffer.alloc(32, 77);
vi.mock("./registry", () => ({
  getContentKeys: () => ({
    current: async () => ({ version: 2, bytes: Buffer.from(key) }),
    byVersion: async (_scope: unknown, version: number) =>
      version === 2 ? { version, bytes: Buffer.from(key) } : null,
  }),
}));
const { signAttachmentRead, verifyAttachmentRead } =
  await import("./attachment-url-token");

describe("attachment read capabilities", () => {
  it("binds an expiry, key version, path and download disposition", async () => {
    const path = "projects/project-1/object-1";
    const token = await signAttachmentRead(path, 60, "0");
    expect(await verifyAttachmentRead(path, String(token.expires),
      String(token.version), "0", token.sig)).toBe(true);
    expect(await verifyAttachmentRead("projects/project-1/object-2",
      String(token.expires), String(token.version), "0", token.sig)).toBe(false);
    expect(await verifyAttachmentRead(path, String(token.expires),
      String(token.version), "1", token.sig)).toBe(false);
    expect(await verifyAttachmentRead(path, String(token.expires),
      "1", "0", token.sig)).toBe(false);
    expect(await verifyAttachmentRead(path, "1", String(token.version),
      "0", token.sig)).toBe(false);
  });
});
