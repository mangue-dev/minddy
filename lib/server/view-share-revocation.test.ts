import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const getProjectAccess = vi.fn();
const from = vi.fn();
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ rpc, from }) }));

const { deleteViewShare } = await import("@/lib/server/view-shares");

beforeEach(() => {
  vi.resetAllMocks();
  getProjectAccess.mockResolvedValue({ isOwner: true });
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: { id: "view", project_id: "project", user_id: null } }),
  };
  from.mockImplementation((name: string) => {
    if (name !== "views") throw new Error(`Unexpected table: ${name}`);
    return query;
  });
});

describe("view share revocation", () => {
  it.each(["revoked", "absent"])("accepts a guarded %s result without provider calls", async (status) => {
    rpc.mockResolvedValue({ data: { status }, error: null });
    expect(await deleteViewShare("view", "actor")).toEqual({ ok: true, share: null });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("revoke_view_share_guarded", { p_view_id: "view" });
    expect(from).toHaveBeenCalledExactlyOnceWith("views");
  });

  it("does not revoke a view outside the actor's project access", async () => {
    getProjectAccess.mockResolvedValue(null);
    expect(await deleteViewShare("view", "actor")).toMatchObject({ ok: false, status: 404 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports a failed guarded revoke instead of claiming sharing was disabled", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Database unavailable" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await deleteViewShare("view", "actor")).toEqual({ ok: false, status: 500, errorKey: "databaseError" });
    } finally { log.mockRestore(); }
  });
});
