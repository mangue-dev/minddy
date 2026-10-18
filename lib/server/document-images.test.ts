// Agents open the images of editor documents through one door (MIN-728), with
// the access rules of the browser routes those images are written with.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  access: new Set<string>(),
  pageFile: null as null | { storage_path: string; file_name: string; mime_type: string },
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: async (_userId: string, projectId: string) => (h.access.has(projectId) ? { canWrite: true } : null),
}));
vi.mock("@/lib/server/page-files", () => ({ getPageFilePath: async () => h.pageFile }));
vi.mock("@/lib/server/attachments", () => ({
  downloadAttachment: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  signedAttachmentUrl: async () => "https://example.test/signed",
}));

const { documentImages, imagesIn, locateDocumentImage, readDocumentImage, resolveDocumentImage } =
  await import("./document-images");

const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
const attachment = (path: string) => `/api/attachments/file?path=${encodeURIComponent(path)}`;
const service = {} as never;

beforeEach(() => {
  h.access = new Set([PROJECT]);
  h.pageFile = null;
});

describe("finding images in Markdown", () => {
  it("lists each image once, with escapes undone", () => {
    const src = attachment(`projects/${PROJECT}/a.png`);
    const markdown = `Intro ![Login \\[error\\]](${src})\n\n![again](${src})\n\n![page](/api/projects/${PROJECT}/pages/files/${FILE})`;
    expect(documentImages(markdown)).toEqual([
      { src, alt: "Login [error]" },
      { src: `/api/projects/${PROJECT}/pages/files/${FILE}`, alt: "page" },
    ]);
  });

  it("collects images from every string of a read result", () => {
    const src = attachment(`projects/${PROJECT}/plan.png`);
    expect(imagesIn({ issue: { description: "none", plan: `- [ ] ![shot](${src})` }, comments: [{ body: "text" }] }))
      .toEqual([{ src, alt: "shot" }]);
  });
});

describe("locating an image address", () => {
  it("reads the app's routes and leaves outside images as URLs", () => {
    expect(locateDocumentImage(attachment(`projects/${PROJECT}/a.png`))).toMatchObject({ kind: "attachment", projectId: PROJECT });
    expect(locateDocumentImage(attachment("chat/user-1/a.png"))).toMatchObject({ kind: "attachment", ownerId: "user-1" });
    expect(locateDocumentImage(`/api/projects/${PROJECT}/pages/files/${FILE}`)).toMatchObject({ kind: "page-file", fileId: FILE });
    expect(locateDocumentImage("https://images.example.com/x.png")).toEqual({ kind: "external", url: "https://images.example.com/x.png" });
    expect(locateDocumentImage(attachment(`projects/${PROJECT}/../${OTHER}/a.png`))).toBeNull();
    expect(locateDocumentImage("javascript:alert(1)")).toBeNull();
  });
});

describe("resolving an image for an account", () => {
  it("opens a project image only for someone with access to that project", async () => {
    const own = await resolveDocumentImage(service, attachment(`projects/${PROJECT}/a.png`), { userId: "user-1" });
    expect(own).toMatchObject({ ok: true, image: { kind: "stored", projectId: PROJECT } });
    expect(await resolveDocumentImage(service, attachment(`projects/${OTHER}/a.png`), { userId: "user-1" }))
      .toEqual({ ok: false, reason: "forbidden" });
    expect(await resolveDocumentImage(service, attachment(`projects/${PROJECT}/a.png`), { userId: "user-1", projectId: OTHER }))
      .toEqual({ ok: false, reason: "forbidden" });
  });

  it("opens a notebook image only for its owner", async () => {
    expect(await resolveDocumentImage(service, attachment("chat/user-1/n.png"), { userId: "user-1" }))
      .toMatchObject({ ok: true });
    expect(await resolveDocumentImage(service, attachment("chat/user-1/n.png"), { userId: "user-2" }))
      .toEqual({ ok: false, reason: "forbidden" });
  });

  it("opens a page file of the project it is stored under", async () => {
    h.pageFile = { storage_path: `projects/${PROJECT}/pages/p/f.png`, file_name: "f.png", mime_type: "image/png" };
    const resolved = await resolveDocumentImage(service, `/api/projects/${PROJECT}/pages/files/${FILE}`, { userId: "user-1" });
    expect(resolved).toMatchObject({ ok: true, image: { fileName: "f.png" } });
    h.pageFile = { storage_path: `projects/${OTHER}/pages/p/f.png`, file_name: "f.png", mime_type: "image/png" };
    expect(await resolveDocumentImage(service, `/api/projects/${PROJECT}/pages/files/${FILE}`, { userId: "user-1" }))
      .toEqual({ ok: false, reason: "missing" });
  });

  it("reads the bytes and their real type", async () => {
    const resolved = await resolveDocumentImage(service, attachment(`projects/${PROJECT}/a.bin`), { userId: "user-1" });
    if (!resolved.ok || resolved.image.kind !== "stored") throw new Error("expected a stored image");
    expect(await readDocumentImage(service, resolved.image)).toMatchObject({ mimeType: "image/png" });
  });
});
