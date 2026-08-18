import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-280 — the sending route is thin, and that's precisely what makes it
 * fragile: all it does is REFUSE. Four refusals, three of which never see the normal use and two would open a door —
 *
 * - the project is not mine → 404 (not 403: we do not say that it exists);
 * - the page is not IN this project, or it is in the trash → 404. Without
 * this check, the page identifier of the URL would be enough to deposit a
 * file in the wiki of a neighboring project;
 * - the file exceeds the limit → 413, BEFORE reading its bytes;
 * - there is no file at all → 400.
 *
 * And only one happy path, of which this test pins the only thing that the client
 * does not remake itself: the ADDRESS rendered, the one which will go into the body
 * of the document and that the markdown projection will copy.
 */

const getAuthedUser = vi.fn();
const getProjectAccess = vi.fn();
const createPageFile = vi.fn();
const maybeSingle = vi.fn();

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: (...args: unknown[]) => getAuthedUser(...args),
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: (...args: unknown[]) => getProjectAccess(...args),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ is: () => ({ maybeSingle }) }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/server/page-files", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/page-files")>()),
  createPageFile: (...args: unknown[]) => createPageFile(...args),
}));

const { POST } = await import(
  "@/app/api/projects/[id]/pages/[pageId]/files/route"
);

const PROJECT = "07b14964-0def-4941-8ddf-686572d6345d";
const PAGE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function request(file?: File) {
  const form = new FormData();
  if (file) form.append("file", file);
  return new Request("https://minddy.app/upload", {
    method: "POST",
    body: form,
  }) as never;
}

const params = { params: Promise.resolve({ id: PROJECT, pageId: PAGE }) };

beforeEach(() => {
  vi.clearAllMocks();
  getAuthedUser.mockResolvedValue({ ok: true, user: { id: "user-1" } });
  getProjectAccess.mockResolvedValue({ role: "owner" });
  maybeSingle.mockResolvedValue({ data: { id: PAGE } });
  createPageFile.mockResolvedValue({
    id: "file-1",
    file_name: "capture.png",
    mime_type: "image/png",
    size_bytes: 4,
  });
});

describe("POST /api/projects/[id]/pages/[pageId]/files", () => {
  it("rend l'adresse que le bloc rangera dans le document", async () => {
    const response = await POST(
      request(new File(["oct"], "capture.png", { type: "image/png" })),
      params
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: "file-1",
      src: `/api/projects/${PROJECT}/pages/files/file-1`,
    });
  });

  it("accepte n'importe quel type de fichier", async () => {
    createPageFile.mockResolvedValue({
      id: "file-2",
      file_name: "archive.zip",
      mime_type: "application/zip",
      size_bytes: 3,
    });
    const response = await POST(
      request(new File(["zip"], "archive.zip", { type: "application/zip" })),
      params
    );
    expect(response.status).toBe(200);
  });

  it("refuse un fichier trop lourd sans lire ses octets", async () => {
    const heavy = new File(
      [new Uint8Array(11 * 1024 * 1024)],
      "énorme.png",
      { type: "image/png" }
    );
    const response = await POST(request(heavy), params);
    expect(response.status).toBe(413);
    expect(createPageFile).not.toHaveBeenCalled();
  });

  it("refuse une requête sans fichier", async () => {
    const response = await POST(request(), params);
    expect(response.status).toBe(400);
    expect(createPageFile).not.toHaveBeenCalled();
  });

  it("refuse un projet auquel on n'a pas accès", async () => {
    getProjectAccess.mockResolvedValue(null);
    const response = await POST(
      request(new File(["oct"], "capture.png", { type: "image/png" })),
      params
    );
    expect(response.status).toBe(404);
    expect(createPageFile).not.toHaveBeenCalled();
  });

  it("refuse une page qui n'est pas dans ce projet (ou qui est à la corbeille)", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    const response = await POST(
      request(new File(["oct"], "capture.png", { type: "image/png" })),
      params
    );
    expect(response.status).toBe(404);
    expect(createPageFile).not.toHaveBeenCalled();
  });
});
