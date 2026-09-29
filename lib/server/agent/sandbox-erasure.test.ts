import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; sandbox_id: string | null; provider_key_id: string | null }>,
  error: null as Error | null,
  deleted: vi.fn(async (_name: string) => {}),
  revoked: vi.fn(async (_key: string) => {}),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: async (name: string) => ({ data: name === "begin_agent_project_erasure" || name === "agent_allocation_erasure_complete" ? true : [], error: null }),
    from: (table: string) => {
      expect(table).toBe("agent_runs");
      let page = h.rows;
      let max = 500;
      const query = {
        eq: (column: string, projectId: string) => {
          expect(column).toBe("project_id");
          expect(projectId).toBe("project-1");
          return query;
        },
        order: () => query,
        limit: (count: number) => { max = count; return query; },
        gt: (_column: string, id: string) => {
          page = page.filter((row) => row.id > id);
          return query;
        },
        then: (resolve: (value: { data: typeof h.rows; error: Error | null }) => void) =>
          Promise.resolve({ data: page.slice(0, max), error: h.error }).then(resolve),
      };
      return {
        select: () => query,
      };
    },
  }),
}));
vi.mock("./sandbox", () => ({ deleteSandboxByName: h.deleted }));
vi.mock("./run-key", () => ({ revokeRunKeyStrict: h.revoked }));

const { eraseAgentSandboxesForProject } = await import("./sandbox-erasure");
const RUN = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  h.rows = [];
  h.error = null;
  h.deleted.mockReset();
  h.revoked.mockReset();
});

describe("project Agent sandbox erasure", () => {
  it("deletes the active sandbox and both historical names before revoking the key", async () => {
    h.rows = [{ id: RUN, sandbox_id: "agent-custom", provider_key_id: "key-1" }];
    await eraseAgentSandboxesForProject("project-1");
    expect(h.deleted.mock.calls.map(([name]) => name)).toEqual([
      "agent-custom",
      `agent-v2-${RUN}`,
      `agent-${RUN}`,
    ]);
    expect(h.revoked).toHaveBeenCalledWith("key-1");
  });

  it("does not revoke or report success when erasure fails", async () => {
    h.rows = [{ id: RUN, sandbox_id: null, provider_key_id: "key-1" }];
    h.deleted.mockRejectedValueOnce(new Error("sandbox unavailable"));
    await expect(eraseAgentSandboxesForProject("project-1")).rejects.toThrow("sandbox unavailable");
    expect(h.revoked).not.toHaveBeenCalled();
  });

  it("reaches a run after the first 500 rows without offset skips", async () => {
    h.rows = Array.from({ length: 501 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
      sandbox_id: null,
      provider_key_id: null,
    }));
    await eraseAgentSandboxesForProject("project-1");
    expect(h.deleted).toHaveBeenCalledWith(`agent-v2-${h.rows[500].id}`);
  });
});
