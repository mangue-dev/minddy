import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-280 — la route d'envoi est mince, et c'est justement ce qui la rend
 * fragile : tout ce qu'elle fait est REFUSER. Quatre refus, dont trois ne se
 * voient jamais à l'usage normal et deux ouvriraient une porte —
 *
 *  - le projet n'est pas le mien → 404 (pas 403 : on ne dit pas qu'il existe) ;
 *  - la page n'est pas DANS ce projet, ou elle est à la corbeille → 404. Sans
 *    cette vérification, l'identifiant de page de l'URL suffirait à déposer un
 *    fichier dans le wiki d'un projet voisin ;
 *  - le fichier dépasse la limite → 413, AVANT de lire ses octets ;
 *  - il n'y a pas de fichier du tout → 400.
 *
 * Et un seul chemin heureux, dont ce test épingle la seule chose que le client
 * ne refabrique pas lui-même : l'ADRESSE rendue, celle qui partira dans le corps
 * du document et que la projection markdown recopiera.
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
