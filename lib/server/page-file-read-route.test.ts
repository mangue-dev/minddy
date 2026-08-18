import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-340 — the reading gate of a page file is the most exposed URL
 * of the repository: it is carried by `minddy.app`, it is STABLE (it lives for
 * months in a document body), and it has no parameters to add to
 * respond. It's the one we send to someone.
 *
 * What it decides, and which this test pinpoints: the DISPOSITION. The type of the
 * line is passed to the signature, and out of allowlist the signature goes back to
 * "attachment" (lib/server/attachments.ts) — a `.png` that contains HTML
 * downloads instead of opening.
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

/** The options passed to the signature — this is where everything comes into play. */
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
  it("displays an image and redirects to the signed URL", async () => {
    const response = await GET(request(), params);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://signed.test/objet");
    expect(signOptions().download).toBe(false);
    expect(signOptions().mimeType).toBe("image/png");
  });

  it("passes the ROW type to the signer regardless of its value", async () => {
    // The type was deduced from the bytes when sending: it is this which is authentic, and
    // it is the signature which determines the disposition.
    getPageFilePath.mockResolvedValue({
      storage_path: `projects/${PROJECT}/pages/p/f/capture.png`,
      file_name: "capture.png",
      mime_type: "text/html",
    });
    await GET(request(), params);
    expect(signOptions().mimeType).toBe("text/html");
  });

  it("names the file when asked to download it", async () => {
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
