import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-324 — the conflict key of `upsertGithubConnection` is the only
 * `installation_id`, and its `update` was rewriting `user_id`: a caller who
 * enumerated these small sequential identifiers could reassign installations
 * belonging to other tenants and gain access to their private repositories.
 *
 * What this test holds: an existing line no longer changes hands, and it
 * is also not modified in passing.
 */

let existing: { id: string; user_id: string } | null = null;
const rpcCalls: Record<string, unknown>[] = [];
let rpcError: { message: string } | null = null;

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: async (_name: string, args: Record<string, unknown>) => {
      rpcCalls.push(args);
      if (rpcError) return { data: null, error: rpcError };
      if (existing?.user_id && existing.user_id !== args.p_user_id) {
        return { data: { state: "owned_by_another" }, error: null };
      }
      return {
        data: { state: "stored", id: existing?.id ?? "new-connection" },
        error: null,
      };
    },
  }),
}));

const { upsertGithubConnection, GithubInstallationOwnedByAnotherUserError } =
  await import("./connections");

const PARAMS = {
  userId: "owner",
  installationId: 4242,
  accountLogin: "acme",
  accountType: "Organization",
  repositorySelection: "selected",
};

beforeEach(() => {
  rpcCalls.length = 0;
  existing = null;
  rpcError = null;
});

describe("upsertGithubConnection", () => {
  it("inserts an unknown installation atomically", async () => {
    const id = await upsertGithubConnection(PARAMS);
    expect(id).toBe("new-connection");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({ p_user_id: "owner", p_installation_id: 4242 });
  });

  it("updates the current owner's row through the same atomic operation", async () => {
    existing = { id: "conn-1", user_id: "owner" };
    const id = await upsertGithubConnection(PARAMS);
    expect(id).toBe("conn-1");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({ p_account_login: "acme" });
  });

  it("rejects an installation owned by another account", async () => {
    existing = { id: "conn-1", user_id: "victim" };
    await expect(upsertGithubConnection(PARAMS)).rejects.toBeInstanceOf(
      GithubInstallationOwnedByAnotherUserError,
    );
    expect(rpcCalls).toHaveLength(1);
  });

  it("does not disclose who owns the installation", async () => {
    existing = { id: "conn-1", user_id: "victim" };
    const err = await upsertGithubConnection(PARAMS).catch((e: Error) => e);
    expect((err as Error).message).not.toContain("victim");
    expect((err as Error).message).not.toContain("conn-1");
  });

  it("surfaces an atomic provisioning failure", async () => {
    rpcError = { message: "injected transaction failure" };
    await expect(upsertGithubConnection(PARAMS)).rejects.toThrow(
      /injected transaction failure/,
    );
  });
});
