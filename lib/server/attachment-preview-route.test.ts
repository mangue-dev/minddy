import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { tryToParsePath } from "next/dist/lib/try-to-parse-path";

const getAuthedUser = vi.fn();
const getProjectAccess = vi.fn();
const info = vi.fn();
const download = vi.fn();
const from = vi.fn(() => ({ info, download }));
const descriptor = vi.fn();
const service = { storage: { from },
  from: () => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => ({ data: null, error: null }),
    limit: () => ({ maybeSingle: descriptor }),
  }) }) }),
};

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: (...args: unknown[]) => getAuthedUser(...args),
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: (...args: unknown[]) => getProjectAccess(...args),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));

const { GET, PREVIEW_CSP } = await import("@/app/api/attachments/file/route");
const {
  ATTACHMENT_FILE_SOURCE,
  ATTACHMENT_PREVIEW_CSP,
  default: nextConfig,
} = await import("../../next.config.mjs");

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
  descriptor.mockResolvedValue({ data: null, error: null });
  getAuthedUser.mockResolvedValue({ ok: true, user: { id: "user-1" } });
  getProjectAccess.mockResolvedValue({ role: "member" });
  info.mockResolvedValue({ data: { contentType: "text/html" }, error: null });
  download.mockResolvedValue({
    data: new Blob(["<!doctype html><h1>Preview</h1>"], { type: "text/html" }),
    error: null,
  });
});

describe("GET /api/attachments/file proxy", () => {
  it("keeps the production header rule aligned with the route sandbox", async () => {
    const configured = await nextConfig.headers!();
    const routeHeaders = configured.find(
      (entry) => entry.source === ATTACHMENT_FILE_SOURCE,
    )?.headers;
    const catchAllSource = configured.find((entry) =>
      entry.source.includes("oauth/authorize(?:/?$)"),
    )?.source;
    const catchAllRegex = catchAllSource
      ? tryToParsePath(catchAllSource).regexStr
      : undefined;

    expect(ATTACHMENT_PREVIEW_CSP).toBe(PREVIEW_CSP);
    expect(routeHeaders).toEqual(
      expect.arrayContaining([
        { key: "Content-Security-Policy", value: PREVIEW_CSP },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ]),
    );
    expect(catchAllRegex).toBeDefined();
    const catchAll = new RegExp(catchAllRegex!);
    expect(catchAll.test("/api/attachments/file")).toBe(false);
    expect(catchAll.test("/api/attachments/file/")).toBe(false);
    expect(catchAll.test("/api/attachments/file/unknown")).toBe(true);
    expect(catchAll.test("/oauth/authorize")).toBe(false);
    expect(catchAll.test("/oauth/authorize/")).toBe(false);
    expect(catchAll.test("/oauth/authorize/unknown")).toBe(true);
  });

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

  it("rejects a project prefix that only starts with a UUID", async () => {
    const response = await GET(
      request(`projects/${PROJECT}suffix/resource/file.html`),
    );

    expect(response.status).toBe(404);
    expect(getProjectAccess).not.toHaveBeenCalled();
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
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps Markdown inline when storage reports a generic MIME type", async () => {
    info.mockResolvedValue({ data: { contentType: "application/octet-stream" }, error: null });
    download.mockResolvedValue({
      data: new Blob(["# Markdown preview"], { type: "application/octet-stream" }),
      error: null,
    });

    const response = await GET(
      request(`projects/${PROJECT}/resource/README.md`),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("# Markdown preview");
    expect(response.headers.get("content-disposition")).toBe("inline");
  });

  it.each(["text/csv", "application/csv", "application/octet-stream", "application/vnd.ms-excel"])(
    "displays an opaque CSV attachment as plain text when storage reports %s",
    async (mimeType) => {
      const csv = new TextEncoder().encode('\uFEFFName,Usage\r\n"Café",16\r\n');
      descriptor.mockResolvedValue({ data: {
        id: "d2b0ed54-361e-45a5-8735-a8d6ef7c8ccd",
        project_id: PROJECT,
        file_name: "vercel-costs.csv",
        mime_type: mimeType,
      }, error: null });
      info.mockResolvedValue({ data: { contentType: mimeType }, error: null });
      download.mockResolvedValue({ data: new Blob([csv]), error: null });
      const path = `projects/${PROJECT}/dd18cf40-e01a-4438-9afa-d5dc4169902b`;

      const response = await GET(request(path));

      expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(response.headers.get("content-disposition")).toBe("inline");
      expect(response.headers.get("content-length")).toBe(String(csv.byteLength));
      expect(response.headers.get("content-security-policy")).toBe(PREVIEW_CSP);
      expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(csv);

      for (const query of ["download=1", "preview=1&download=1", ""]) {
        const downloaded = await GET(request(path, query));
        expect(downloaded.headers.get("content-type")).toBe(mimeType);
        expect(downloaded.headers.get("content-disposition")).toBe(
          "attachment; filename*=UTF-8''vercel-costs.csv",
        );
        expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(csv);
      }
    },
  );

  it("displays CSV MIME types without relying on a filename extension", async () => {
    info.mockResolvedValue({ data: { contentType: "text/csv" }, error: null });
    download.mockResolvedValue({ data: new Blob(["Name,Usage\nMinddy,16\n"]), error: null });

    const response = await GET(request(`projects/${PROJECT}/resource/export`));

    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe("inline");
  });

  it("renders markup in a CSV filename as inert text even when sniffed as HTML", async () => {
    const markup = '<script>alert("preview")</script>,value';
    download.mockResolvedValue({ data: new Blob([markup]), error: null });

    const response = await GET(request(`projects/${PROJECT}/resource/export.csv`));

    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("content-security-policy")).toBe(PREVIEW_CSP);
    expect(await response.text()).toBe(markup);
  });

  it("uses sniffed markup instead of a misleading image content type", async () => {
    info.mockResolvedValue({ data: { contentType: "image/png" }, error: null });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html");
  });

  it("proxies unsupported previews as forced downloads", async () => {
    info.mockResolvedValue({ data: { contentType: "application/zip" }, error: null });
    download.mockResolvedValue({
      data: new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], {
        type: "application/zip",
      }),
      error: null,
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''file.html"
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    );
  });

  it("returns not found when the storage object cannot be read", async () => {
    download.mockResolvedValue({ data: null, error: { message: "missing" } });

    const response = await GET(request());

    expect(response.status).toBe(404);
  });

  it("proxies explicit downloads without exposing the storage address", async () => {
    const response = await GET(request(PATH, "download=1"));

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("attachments");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''file.html"
    );
    expect(await response.text()).toContain("<h1>Preview</h1>");
  });

  it("forces active content to download outside the sandboxed preview", async () => {
    const response = await GET(request(PATH, ""));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("content-security-policy")).toBeNull();
  });

  it("serves allowlisted content inline outside preview mode", async () => {
    info.mockResolvedValue({ data: { contentType: "image/png" }, error: null });
    download.mockResolvedValue({
      data: new Blob([
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ]),
      error: null,
    });

    const response = await GET(request(PATH, ""));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
  });
});
