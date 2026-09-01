import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RENAME and DELETE an agent conversation.
 *
 * So far the route only had a GET: there was NO path to
 * deleting a run — neither button nor verb. A conversation whose loop
 * dies remains `running`, does not stop, does not guide, and the only outcome was
 * a `delete` in production. Hence the point of this file: what happens BEFORE `delete` *, and which can no longer be done after.
 */

const getAuthedUser = vi.fn();
const getProjectAccess = vi.fn();
const getRun = vi.fn();
const requestInterrupt = vi.fn(async () => {});
const stopSandboxByName = vi.fn(async () => {});
const revokeRunKey = vi.fn(async () => {});
const h = vi.hoisted(() => ({
  updated: [] as Array<Record<string, unknown>>,
  deleted: [] as string[],
}));

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: (...args: unknown[]) => getAuthedUser(...args),
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: (...args: unknown[]) => getProjectAccess(...args),
}));
vi.mock("@/lib/server/agent/runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/agent/runs")>()),
  getRun: (...args: unknown[]) => getRun(...args),
  requestInterrupt: (...args: unknown[]) => requestInterrupt(...(args as [])),
}));
vi.mock("@/lib/server/agent/sandbox", () => ({
  stopSandboxByName: (...args: unknown[]) => stopSandboxByName(...(args as [])),
}));
vi.mock("@/lib/server/agent/run-key", () => ({
  revokeRunKey: (...args: unknown[]) => revokeRunKey(...(args as [])),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      update: (fields: Record<string, unknown>) => {
        h.updated.push(fields);
        return { eq: async () => ({ error: null }) };
      },
      delete: () => ({
        eq: async (_column: string, value: string) => {
          h.deleted.push(value);
          return { error: null };
        },
      }),
    }),
  }),
}));

const { GET, PATCH, DELETE } = await import("@/app/api/agent-runs/[runId]/route");

const RUN = "11111111-2222-4333-8444-555555555555";
const params = Promise.resolve({ runId: RUN });

const patch = (body: unknown) =>
  PATCH(
    new Request("https://minddy.app/api/agent-runs/x", {
      method: "PATCH",
      body: JSON.stringify(body),
    }) as never,
    { params },
  );

const get = () =>
  GET(new Request("https://minddy.app/api/agent-runs/x") as never, { params });

const del = () =>
  DELETE(
    new Request("https://minddy.app/api/agent-runs/x", { method: "DELETE" }) as never,
    { params },
  );

beforeEach(() => {
  h.updated.length = 0;
  h.deleted.length = 0;
  requestInterrupt.mockClear();
  stopSandboxByName.mockClear();
  revokeRunKey.mockClear();
  getAuthedUser.mockResolvedValue({ ok: true, user: { id: "user-1" } });
  getProjectAccess.mockResolvedValue({ isMember: true });
  getRun.mockResolvedValue({
    id: RUN,
    project_id: "proj-1",
    // MIN-332: the conversation belongs to whoever had it, and the three anchors
    // which would make it a gesture of the PROJECT are empty — this is the ordinary case.
    created_by: "user-1",
    routine_id: null,
    chain_id: null,
    pull_request_id: null,
    status: "running",
    sandbox_id: "agent-run-1",
    provider_key_id: "hash-1",
    title: "Vieux titre",
  });
});

/**
 * MIN-332 — the conversation belongs to who had it.
 *
 * These three verbs read the run IN KEY SERVICE and only asked for
 * membership in the project: the policy `agent_runs_select`, the only one to carry the
 * rule, kept nothing here. So an ordinary member would read a teammate's prompt, rename it, delete it.
 */
describe("visibility — a personal run is not the project run", () => {
  const asTeammate = () => {
    getAuthedUser.mockResolvedValue({ ok: true, user: { id: "user-2" } });
  };

  it("returns 404 when READING another member's conversation", async () => {
    asTeammate();
    const res = await get();
    expect(res.status).toBe(404);
  });

  it("returns 404 when RENAMING, and writes nothing", async () => {
    asTeammate();
    const res = await patch({ title: "x" });
    expect(res.status).toBe(404);
    expect(h.updated).toHaveLength(0);
  });

  it("returns 404 when DELETING, and does not stop the microVM", async () => {
    asTeammate();
    const res = await del();
    expect(res.status).toBe(404);
    expect(h.deleted).toHaveLength(0);
    expect(stopSandboxByName).not.toHaveBeenCalled();
  });

  it("mais un PASSAGE DE ROUTINE reste lisible par tout membre", async () => {
    // The routine is an object of the PROJECT: its `created_by` is the bearer of the
    // rule, not an actor. Reserving it for him would make his executions invisible
    // to the team who put them in place.
    asTeammate();
    getRun.mockResolvedValue({
      id: RUN,
      project_id: "proj-1",
      created_by: "user-1",
      routine_id: "routine-1",
      chain_id: null,
      pull_request_id: null,
      status: "completed",
    });
    const res = await get();
    expect(res.status).toBe(200);
  });

  it("also rejects a PR REVIEW session — its subject is public", async () => {
    asTeammate();
    getRun.mockResolvedValue({
      id: RUN,
      project_id: "proj-1",
      created_by: "user-1",
      routine_id: null,
      chain_id: null,
      pull_request_id: "pr-1",
      status: "completed",
    });
    const res = await get();
    expect(res.status).toBe(200);
  });
});

describe("GET — resumability", () => {
  it("exposes a failed run with a checkpoint as resumable without exposing the checkpoint", async () => {
    getRun.mockResolvedValue({
      id: RUN,
      project_id: "proj-1",
      created_by: "user-1",
      routine_id: null,
      chain_id: null,
      pull_request_id: null,
      status: "failed",
      checkpoint: { messages: [] },
    });

    const body = await (await get()).json();
    expect(body.run.resumable).toBe(true);
    expect(body.run).not.toHaveProperty("checkpoint");
  });

  it("keeps a failed bootstrap without a checkpoint non-resumable", async () => {
    getRun.mockResolvedValue({
      id: RUN,
      project_id: "proj-1",
      created_by: "user-1",
      routine_id: null,
      chain_id: null,
      pull_request_id: null,
      status: "failed",
      checkpoint: null,
    });

    const body = await (await get()).json();
    expect(body.run.resumable).toBe(false);
  });
});

describe("PATCH — renommer", () => {
  it("writes the run title", async () => {
    const res = await patch({ title: "  Migration Electron  " });
    expect(res.status).toBe(200);
    expect(h.updated).toEqual([{ title: "Migration Electron" }]);
  });

  it("un titre VIDE efface le sien — c'est le chemin de retour", async () => {
    // The conversation then returns to the title of his ticket (cf.
    // `agentSessionTitle`). Interdire l'effacement rendrait un renommage
    // definitely unhappy.
    await patch({ title: "   " });
    expect(h.updated).toEqual([{ title: null }]);
  });

  it("refuse un corps sans titre — on ne devine pas un effacement", async () => {
    const res = await patch({});
    expect(res.status).toBe(400);
    expect(h.updated).toHaveLength(0);
  });

  it("returns 404 for a non-member of the project — not 403", async () => {
    // Saying “forbidden” would already learn that a run has this identifier.
    getProjectAccess.mockResolvedValue(null);
    const res = await patch({ title: "x" });
    expect(res.status).toBe(404);
    expect(h.updated).toHaveLength(0);
  });
});

describe("DELETE — supprimer", () => {
  it("stops the microVM and revokes the key BEFORE deleting the row", async () => {
    const res = await del();
    expect(res.status).toBe(200);
    // The order is everything: after the `delete`, we no longer have either the name of the sandbox or
    // the hash of the key. The microVM would run until the end of its session (24 hours
    // billed) and the key would remain valid, with nothing left in the base to say
    // lesquelles.
    expect(stopSandboxByName).toHaveBeenCalledWith("agent-run-1");
    expect(revokeRunKey).toHaveBeenCalledWith("hash-1");
    expect(h.deleted).toEqual([RUN]);
  });

  it("deletes a conversation that is WORKING — this is the case that caused it to be written", async () => {
    // A dead loop leaves a `running` run that cannot be stopped or guided.
    // Refusing to remove it would only leave the base for issue.
    await del();
    expect(requestInterrupt).toHaveBeenCalledWith(RUN);
    expect(h.deleted).toEqual([RUN]);
  });

  it("ne demande pas d'interruption à une conversation au repos", async () => {
    getRun.mockResolvedValue({
      id: RUN,
      project_id: "proj-1",
      created_by: "user-1",
      routine_id: null,
      chain_id: null,
      pull_request_id: null,
      status: "completed",
      sandbox_id: null,
      provider_key_id: null,
    });
    await del();
    expect(requestInterrupt).not.toHaveBeenCalled();
    expect(stopSandboxByName).not.toHaveBeenCalled();
    expect(h.deleted).toEqual([RUN]);
  });

  it("returns 404 for a non-member — and deletes nothing", async () => {
    getProjectAccess.mockResolvedValue(null);
    const res = await del();
    expect(res.status).toBe(404);
    expect(h.deleted).toHaveLength(0);
    expect(stopSandboxByName).not.toHaveBeenCalled();
  });
});
