import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { MAX_ATTACHMENT_REQUEST_BYTES, MAX_ATTACHMENT_UPLOAD_BYTES } from
  "@/lib/attachment-upload-limits";

const getAuthedUser = vi.fn();
const getProjectAccess = vi.fn();
const projectStorageAllowed = vi.fn();
const uploadPrivateAttachmentObject = vi.fn();
const service = {};
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser }));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess }));
vi.mock("@/lib/server/storage-quota", () => ({ projectStorageAllowed }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/attachments", async (importOriginal) => ({
  ...await importOriginal<typeof import("./attachments")>(),
  uploadPrivateAttachmentObject,
}));

const { POST } = await import("@/app/api/attachments/upload/route");
const { parseResourcesInput } = await import("./attachments");
const { prAttachmentResponse } = await import("./agent/pr-actions");
const project = "11111111-1111-4111-8111-111111111111";
const prefix = `projects/${project}`;

function request(size: number) {
  const form = new FormData();
  form.set("prefix", prefix);
  form.set("file", new File([new Uint8Array(size)], `${"é".repeat(196)}.pdf`,
    { type: "application/pdf" }));
  return new Request("https://minddy.test/api/attachments/upload",
    { method: "POST", body: form }) as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  getAuthedUser.mockResolvedValue({ ok: true, user: { id: project } });
  getProjectAccess.mockResolvedValue({ role: "member" });
  projectStorageAllowed.mockResolvedValue(true);
  uploadPrivateAttachmentObject.mockResolvedValue(undefined);
});

describe("attachment ingress limit", () => {
  it("fits the largest permitted file and multipart metadata below the hosting limit", async () => {
    const upload = request(MAX_ATTACHMENT_UPLOAD_BYTES);
    expect((await upload.clone().arrayBuffer()).byteLength)
      .toBeLessThan(MAX_ATTACHMENT_REQUEST_BYTES);
    const response = await POST(upload);
    expect(response.status).toBe(200);
    expect((await response.json()).size_bytes).toBe(MAX_ATTACHMENT_UPLOAD_BYTES);
    expect(uploadPrivateAttachmentObject).toHaveBeenCalledOnce();
  });

  it("rejects an oversized private file before quota or storage work", async () => {
    expect((await POST(request(MAX_ATTACHMENT_UPLOAD_BYTES + 1))).status).toBe(400);
    expect(projectStorageAllowed).not.toHaveBeenCalled();
    expect(uploadPrivateAttachmentObject).not.toHaveBeenCalled();
  });

  it("rejects an oversized forge file before reading its bytes", async () => {
    const file = new File([new Uint8Array(MAX_ATTACHMENT_UPLOAD_BYTES + 1)], "large.pdf");
    const read = vi.spyOn(file, "arrayBuffer");
    const scope = { actor: async () => ({ kind: "actor", capability: "read" }) };
    const response = await prAttachmentResponse(scope as never, file);
    expect(response.status).toBe(413);
    expect(read).not.toHaveBeenCalled();
  });

  it("still accepts descriptors for previously stored 20 MiB attachments", () => {
    expect(parseResourcesInput([{
      storage_path: `${prefix}/historical/file.pdf`, file_name: "file.pdf",
      mime_type: "application/pdf", size_bytes: 20 * 1024 * 1024,
    }], `${prefix}/`)).toHaveLength(1);
  });
});
