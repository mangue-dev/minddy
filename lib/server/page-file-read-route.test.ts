import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-340 — la porte de lecture d'un fichier de page est l'URL la plus exposée
 * du dépôt : elle est portée par `minddy.app`, elle est STABLE (elle vit des
 * mois dans un corps de document), et elle n'a aucun paramètre à ajouter pour
 * répondre. C'est celle qu'on envoie à quelqu'un.
 *
 * Ce qu'elle décide, et que ce test épingle : la DISPOSITION. Le type de la
 * ligne est passé à la signature, et hors allowlist la signature repart en
 * « pièce jointe » (lib/server/attachments.ts) — un `.png` qui contient du HTML
 * se télécharge au lieu de s'ouvrir.
 */

const getAuthedUser = vi.fn();
const getProjectAccess = vi.fn();
const getPageFilePath = vi.fn();
const signedAttachmentUrl = vi.fn();

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: (...args: unknown[]) => getAuthedUser(...args),
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: (...args: unknown[]) => getProjectAccess(...args),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/server/attachments", () => ({
  signedAttachmentUrl: (...args: unknown[]) => signedAttachmentUrl(...args),
}));
vi.mock("@/lib/server/page-files", () => ({
  getPageFilePath: (...args: unknown[]) => getPageFilePath(...args),
}));

const { GET } = await import(
  "@/app/api/projects/[id]/pages/files/[fileId]/route"
);

const PROJECT = "07b14964-0def-4941-8ddf-686572d6345d";
const FILE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const params = { params: Promise.resolve({ id: PROJECT, fileId: FILE }) };

function request(query = "") {
  const url = `https://minddy.app/api/projects/${PROJECT}/pages/files/${FILE}${query}`;
  return { nextUrl: new URL(url), headers: new Headers() } as never;
}

/** Les options passées à la signature — c'est là que tout se joue. */
function signOptions() {
  return signedAttachmentUrl.mock.calls[0][2] as {
    download: string | boolean;
    mimeType: string;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getAuthedUser.mockResolvedValue({ ok: true, user: { id: "user-1" } });
  getProjectAccess.mockResolvedValue({ role: "member" });
  signedAttachmentUrl.mockResolvedValue("https://signed.test/objet");
  getPageFilePath.mockResolvedValue({
    storage_path: `projects/${PROJECT}/pages/p/f/capture.png`,
    file_name: "capture.png",
    mime_type: "image/png",
  });
});

describe("GET /api/projects/[id]/pages/files/[fileId]", () => {
  it("affiche une image, et redirige vers l'URL signée", async () => {
    const response = await GET(request(), params);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://signed.test/objet");
    expect(signOptions().download).toBe(false);
    expect(signOptions().mimeType).toBe("image/png");
  });

  it("passe à la signature le type de la LIGNE, quel qu'il soit", async () => {
    // Le type y a été déduit des octets à l'envoi : c'est lui qui fait foi, et
    // c'est la signature qui en tire la disposition.
    getPageFilePath.mockResolvedValue({
      storage_path: `projects/${PROJECT}/pages/p/f/capture.png`,
      file_name: "capture.png",
      mime_type: "text/html",
    });
    await GET(request(), params);
    expect(signOptions().mimeType).toBe("text/html");
  });

  it("nomme le fichier quand on demande à l'enregistrer", async () => {
    await GET(request("?download=1"), params);
    expect(signOptions().download).toBe("capture.png");
  });

  it("ne dit rien d'un projet qui n'est pas le mien", async () => {
    getProjectAccess.mockResolvedValue(null);
    const response = await GET(request(), params);
    expect(response.status).toBe(404);
    expect(signedAttachmentUrl).not.toHaveBeenCalled();
  });
});
