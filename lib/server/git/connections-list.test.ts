import { describe, expect, it, vi } from "vitest";

let linkedProjectError: { message: string } | null = null;

function queryFor(table: string) {
  const query: Record<string, unknown> = {};
  query.select = () => query;
  query.eq = () => query;
  query.in = () => query;
  query.order = () => query;
  query.then = (resolve: (value: unknown) => void) => {
    resolve(
      table === "git_connections"
        ? {
            data: [{
              id: "connection-1",
              provider: "github",
              account_login: "acme",
              account_type: "Organization",
              installation_id: 42,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            }],
            error: null,
          }
        : { data: null, error: linkedProjectError },
    );
  };
  return query;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (table: string) => queryFor(table) }),
}));

const { listUserConnections } = await import("./connections");

describe("listUserConnections", () => {
  it("fails visibly when linked-project loading fails", async () => {
    linkedProjectError = { message: "injected linked-project failure" };
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(listUserConnections("user-1")).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      "[git-connections] linked-project lookup failed:",
      "injected linked-project failure",
    );
  });
});
