// An agent gets an image address it can write into a text (MIN-1030): the
// bytes decide what is accepted, and a reused resource is copied.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  quota: true,
  uploads: [] as { path: string; bytes: Uint8Array; mime: string }[],
  uploadFails: false,
  resource: null as null | { id: string; kind: string; storage_path: string | null },
  stored: null as Buffer | null,
}));
vi.mock("@/lib/server/storage-quota", () => ({ projectStorageAllowed: async () => h.quota }));
vi.mock("@/lib/server/attachments", () => ({
  opaqueAttachmentPath: (prefix: string) => `${prefix}/44444444-4444-4444-8444-444444444444`,
  uploadPrivateAttachmentObject: async (_service: unknown, path: string, bytes: Uint8Array, mime: string) => {
    if (h.uploadFails) throw new Error("attachment upload failed");
    h.uploads.push({ path, bytes, mime });
  },
  downloadAttachment: async () => h.stored,
}));

const { inlineImageFromResource, inlineImageMarkdown, storeInlineImage } = await import("./inline-images");

const PROJECT = "11111111-1111-4111-8111-111111111111";
const RESOURCE = "33333333-3333-4333-8333-333333333333";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const SRC = `/api/attachments/file?path=projects%2F${PROJECT}%2F44444444-4444-4444-8444-444444444444`;

/** A service client whose `attachments` lookup answers with `h.resource`. */
const filters: [string, unknown][] = [];
const service = {
  from: () => {
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      },
      maybeSingle: async () => ({ data: h.resource, error: null }),
    };
    return query;
  },
} as never;

beforeEach(() => {
  h.quota = true;
  h.uploads = [];
  h.uploadFails = false;
  h.resource = null;
  h.stored = null;
  filters.length = 0;
});

describe("storing an image for a text", () => {
  it("stores the bytes under the project and returns the Markdown to write", async () => {
    const result = await storeInlineImage(service, { projectId: PROJECT, data: PNG, alt: "Login error" });
    expect(result).toEqual({
      ok: true,
      image: { src: SRC, markdown: `![Login error](${SRC})`, mime_type: "image/png", size_bytes: PNG.byteLength },
    });
    expect(h.uploads).toHaveLength(1);
    expect(h.uploads[0]).toMatchObject({ path: `projects/${PROJECT}/44444444-4444-4444-8444-444444444444`, mime: "image/png" });
  });

  it("reads the type from the bytes and refuses what an image tag cannot show", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const pdf = Buffer.from("%PDF-1.7 not an image");
    for (const data of [svg, pdf, Buffer.from("plain text")]) {
      const result = await storeInlineImage(service, { projectId: PROJECT, data });
      expect(result).toMatchObject({ ok: false, code: "invalid" });
    }
    expect(await storeInlineImage(service, { projectId: PROJECT, data: Buffer.alloc(0) }))
      .toMatchObject({ ok: false, code: "invalid" });
    expect(h.uploads).toHaveLength(0);
  });

  it("refuses an image over 10 MB before storing anything", async () => {
    const large = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]);
    expect(await storeInlineImage(service, { projectId: PROJECT, data: large }))
      .toMatchObject({ ok: false, code: "invalid" });
    expect(h.uploads).toHaveLength(0);
  });

  it("stops at the project's storage quota", async () => {
    h.quota = false;
    expect(await storeInlineImage(service, { projectId: PROJECT, data: PNG }))
      .toMatchObject({ ok: false, code: "quota" });
    expect(h.uploads).toHaveLength(0);
  });

  it("reports a storage failure instead of an address that leads nowhere", async () => {
    h.uploadFails = true;
    expect(await storeInlineImage(service, { projectId: PROJECT, data: PNG }))
      .toMatchObject({ ok: false, code: "storage" });
  });

  it("writes an alt text that cannot break out of its brackets", () => {
    expect(inlineImageMarkdown(SRC, "a ] b [ c \\ d\nnext")).toBe(`![a \\] b \\[ c \\\\ d next](${SRC})`);
    expect(inlineImageMarkdown(SRC)).toBe(`![](${SRC})`);
  });
});

describe("showing a file resource in a text", () => {
  it("copies the resource's image into an object of its own", async () => {
    h.resource = { id: RESOURCE, kind: "file", storage_path: `projects/${PROJECT}/original` };
    h.stored = PNG;
    const result = await inlineImageFromResource(service, { projectId: PROJECT, resourceId: RESOURCE, alt: "Mockup" });
    expect(result).toMatchObject({ ok: true, image: { src: SRC, markdown: `![Mockup](${SRC})` } });
    // The lookup is scoped to the caller's project, and the copy has a new path.
    expect(filters).toContainEqual(["project_id", PROJECT]);
    expect(h.uploads[0].path).not.toBe(`projects/${PROJECT}/original`);
  });

  it("refuses a link, a page, an unknown id and a file that is not an image", async () => {
    expect(await inlineImageFromResource(service, { projectId: PROJECT, resourceId: RESOURCE }))
      .toMatchObject({ ok: false, code: "not_found" });
    h.resource = { id: RESOURCE, kind: "link", storage_path: null };
    expect(await inlineImageFromResource(service, { projectId: PROJECT, resourceId: RESOURCE }))
      .toMatchObject({ ok: false, code: "not_found" });
    h.resource = { id: RESOURCE, kind: "file", storage_path: `projects/${PROJECT}/doc` };
    h.stored = Buffer.from("%PDF-1.7");
    expect(await inlineImageFromResource(service, { projectId: PROJECT, resourceId: RESOURCE }))
      .toMatchObject({ ok: false, code: "invalid" });
    expect(h.uploads).toHaveLength(0);
  });
});
