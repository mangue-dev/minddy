import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const getAuthedUser = vi.fn();
const getProjectAccess = vi.fn();
const signedAttachmentUrl = vi.fn();
const info = vi.fn();
const download = vi.fn();
const from = vi.fn(() => ({ info, download }));
const service = { storage: { from } };

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: (...args: unknown[]) => getAuthedUser(...args),
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: (...args: unknown[]) => getProjectAccess(...args),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/attachments", () => ({
  signedAttachmentUrl: (...args: unknown[]) => signedAttachmentUrl(...args),
}));

const { GET } = await import("@/app/api/attachments/file/route");

const PROJECT = "07b14964-0def-4941-8ddf-686572d6345d";
const PATH = `projects/${PROJECT}/resource/file.html`;

function request(path = PATH, query = "preview=1") {
  const params = new URLSearchParams({ path });
  if (query) {
    for (const [key, value] of new URLSearchParams(query)) params.set(key, value);
  }
  return new NextRequest(`https://minddy.test/api/attachments/file?${params}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  getAuthedUser.mockResolvedValue({ ok: true, user: { id: "user-1" } });
  getProjectAccess.mockResolvedValue({ role: "member" });
  info.mockResolvedValue({ data: { contentType: "text/html" }, error: null });
  download.mockResolvedValue({
    data: new Blob(["<!doctype html><h1>Preview</h1>"], { type: "text/html" }),
    error: null,
  });
  signedAttachmentUrl.mockResolvedValue("https://signed.test/file");
});

describe("GET /api/attachments/file preview", () => {
  it("returns the authentication response before reading storage", async () => {
    getAuthedUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("keeps project attachment existence private from non-members", async () => {
    getProjectAccess.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(from).not.toHaveBeenCalled();
  });

  it("proxies HTML with an inline disposition and restrictive sandbox", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<h1>Preview</h1>");
    expect(response.headers.get("content-type")).toBe("text/html");
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'"
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(signedAttachmentUrl).not.toHaveBeenCalled();
  });

  it("uses sniffed markup instead of a misleading image content type", async () => {
    info.mockResolvedValue({ data: { contentType: "image/png" }, error: null });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html");
  });

  it("redirects unsupported preview requests to a forced download", async () => {
    info.mockResolvedValue({ data: { contentType: "application/zip" }, error: null });
    download.mockResolvedValue({
      data: new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], {
        type: "application/zip",
      }),
      error: null,
    });

    const response = await GET(request());

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://signed.test/file");
    expect(signedAttachmentUrl).toHaveBeenCalledWith(service, PATH, {
      download: true,
      mimeType: "application/zip",
    });
  });

  it("returns not found when the storage object cannot be read", async () => {
    download.mockResolvedValue({ data: null, error: { message: "missing" } });

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(signedAttachmentUrl).not.toHaveBeenCalled();
  });

  it("retains the signed URL path outside preview mode", async () => {
    const response = await GET(request(PATH, "download=1"));

    expect(response.status).toBe(302);
    expect(from).not.toHaveBeenCalled();
    expect(signedAttachmentUrl).toHaveBeenCalledWith(service, PATH, {
      download: true,
    });
  });
});
