import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getAuthedUser = vi.fn();
const getProjectAccess = vi.fn();
const getBoardByToken = vi.fn();
const getPublicShareTarget = vi.fn();
const isShareUnlocked = vi.fn();
const downloadProjectIcon = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: (...args: unknown[]) => getAuthedUser(...args),
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: (...args: unknown[]) => getProjectAccess(...args),
}));
vi.mock("@/lib/server/feedback/boards", () => ({
  getBoardByToken: (...args: unknown[]) => getBoardByToken(...args),
}));
vi.mock("@/lib/server/view-shares", () => ({
  getPublicShareTarget: (...args: unknown[]) => getPublicShareTarget(...args),
}));
vi.mock("@/lib/server/share-unlock", () => ({
  isShareUnlocked: (...args: unknown[]) => isShareUnlocked(...args),
}));
vi.mock("@/lib/server/project-icon", () => ({
  downloadProjectIcon: (...args: unknown[]) => downloadProjectIcon(...args),
}));

const { GET } = await import("@/app/api/projects/[id]/icon/content/route");
const projectId = "11111111-1111-4111-8111-111111111111";
const params = { params: Promise.resolve({ id: projectId }) };
const icon = { bytes: Buffer.from("protected image"), mimeType: "image/webp" };

beforeEach(() => {
  vi.resetAllMocks();
  getAuthedUser.mockResolvedValue({ ok: false });
  getProjectAccess.mockResolvedValue(null);
  getBoardByToken.mockResolvedValue(null);
  getPublicShareTarget.mockResolvedValue(null);
  isShareUnlocked.mockResolvedValue(false);
  downloadProjectIcon.mockResolvedValue(icon);
});

function request(query = "") {
  return new NextRequest(`https://minddy.example/api/projects/${projectId}/icon/content${query}`);
}

describe("private project icon delivery", () => {
  it("refuses anonymous and former members before touching storage", async () => {
    expect((await GET(request(), params)).status).toBe(404);
    getAuthedUser.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    expect((await GET(request(), params)).status).toBe(404);
    expect(downloadProjectIcon).not.toHaveBeenCalled();
  });

  it("serves current members with a private non-cacheable response", async () => {
    getAuthedUser.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    getProjectAccess.mockResolvedValue({ project: { id: projectId } });
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("protected image");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("binds feedback and page capabilities to the same live project", async () => {
    getBoardByToken.mockResolvedValue({ board: { enabled: true },
      project: { id: "other-project" } });
    expect((await GET(request("?share_kind=feedback&share_token=valid"), params))
      .status).toBe(404);
    getBoardByToken.mockResolvedValue({ board: { enabled: true },
      project: { id: projectId } });
    expect((await GET(request("?share_kind=feedback&share_token=valid"), params))
      .status).toBe(200);
    getPublicShareTarget.mockResolvedValue({ project: { id: projectId },
      share: { level: "password" } });
    expect((await GET(request("?share_kind=share&share_token=locked"), params))
      .status).toBe(404);
    isShareUnlocked.mockResolvedValue(true);
    expect((await GET(request("?share_kind=share&share_token=public"), params))
      .status).toBe(200);
    expect(downloadProjectIcon).toHaveBeenCalledTimes(2);
  });
});
