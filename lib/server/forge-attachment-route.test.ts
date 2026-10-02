import { beforeEach, describe, expect, it, vi } from "vitest";

const lookup = vi.fn();
const download = vi.fn();
const decodeAttachmentObject = vi.fn();
const storageFrom = vi.fn(() => ({ download }));
const service = {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: lookup }) }) }),
  storage: { from: storageFrom },
};

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/encryption/attachment-object-content", () => ({
  decodeAttachmentObject: (...args: unknown[]) => decodeAttachmentObject(...args),
}));

const { GET } = await import("@/app/api/pr-attachments/[...path]/route");
const pr = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function read(path: string[]) {
  return GET(new Request("https://minddy.test/api/pr-attachments"),
    { params: Promise.resolve({ path }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  download.mockResolvedValue({ data: new Blob([png]), error: null });
  decodeAttachmentObject.mockResolvedValue(Buffer.from(png));
});

describe("forge attachment capability reader", () => {
  it("decodes registered ciphertext and derives inline MIME from authenticated bytes", async () => {
    const path = `projects/${pr}/forge/${id}/${id}`;
    lookup.mockResolvedValue({ data: { storage_path: path }, error: null });

    const response = await read([id]);

    expect(response.status).toBe(200);
    expect(decodeAttachmentObject).toHaveBeenCalledWith(path, Buffer.from(png));
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toBe("inline");
  });

  it("keeps historical forge URLs readable from the private bucket during rewrite", async () => {
    lookup.mockResolvedValue({ data: null, error: null });

    const response = await read([pr, id, "human-name.png"]);

    expect(response.status).toBe(200);
    expect(download).toHaveBeenCalledWith(`${pr}/${id}/human-name.png`);
    expect(decodeAttachmentObject).not.toHaveBeenCalled();
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("does not resolve an unregistered new capability", async () => {
    lookup.mockResolvedValue({ data: null, error: null });

    expect((await read([id])).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });
});
