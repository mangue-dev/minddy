import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const access = vi.fn();
const readRows = vi.fn();
const summarize = vi.fn();

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({ ok: true, user: { id: "user-1" } }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: (...args: unknown[]) => access(...args) }));
vi.mock("@/lib/server/integrations", () => ({
  readIntegrationRows: (...args: unknown[]) => readRows(...args),
  summarizeIntegrations: (...args: unknown[]) => summarize(...args),
  createIntegration: vi.fn(),
}));

const { GET } = await import("@/app/api/projects/[id]/integrations/route");
const read = () => GET(new NextRequest("http://localhost/api/projects/p1/integrations"), { params: Promise.resolve({ id: "p1" }) });

beforeEach(() => {
  access.mockReset();
  readRows.mockReset().mockResolvedValue([{ id: "i1" }]);
  summarize.mockReset().mockResolvedValue([{ id: "i1", name: "Webhook" }]);
});

describe("GET /api/projects/[id]/integrations", () => {
  it("reads the stored rows beside the access check and decodes them for a writer", async () => {
    let grant!: (value: unknown) => void;
    access.mockReturnValue(new Promise((resolve) => { grant = resolve; }));
    const pending = read();
    await vi.waitFor(() => expect(readRows).toHaveBeenCalledWith("p1"));
    expect(summarize).not.toHaveBeenCalled();
    grant({ canWrite: true, isOwner: true });
    const response = await pending;
    expect(await response.json()).toEqual({ integrations: [{ id: "i1", name: "Webhook" }], isOwner: true });
  });

  it.each([
    [null, 404],
    [{ canWrite: false, isOwner: false }, 200],
  ])("never decodes the rows without write access (%o)", async (granted, status) => {
    access.mockResolvedValue(granted);
    const response = await read();
    expect(response.status).toBe(status);
    expect(summarize).not.toHaveBeenCalled();
    if (status === 200) expect(await response.json()).toEqual({ integrations: [], isOwner: false });
  });

  it("answers 500 when the rows could not be read", async () => {
    access.mockResolvedValue({ canWrite: true, isOwner: false });
    readRows.mockResolvedValue(null);
    expect((await read()).status).toBe(500);
  });
});
