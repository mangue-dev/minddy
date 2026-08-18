import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-332 — the two surfaces which SERVE a conversation without going through the
 * RLS, and which therefore served it for the entire project.
 *
 * • `/api/agent-runs/[runId]/events` — the thread itself (thoughts, calls tool,
 * results). Read in service key: the policy `agent_run_events_select` does not keep
 * anything here, it is this control which replaces it.
 * • `/api/issues/[id]/agent` — the side panel of a ticket. The ticket is
 * public, its conversations are not: the panel should only show
 * MINE, plus what the project has triggered.
 *
 * We only mock what OUT of the process (auth, membership, base).
 */

const getAuthedUser = vi.fn();
const getProjectAccess = vi.fn();
const getRun = vi.fn();
const h = vi.hoisted(() => ({
  runRows: [] as Array<Record<string, unknown>>,
  eventRows: [] as Array<Record<string, unknown>>,
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
}));

/** The bare minimum of PostgREST: two tables, and a `then` which returns the batch. */
vi.mock("@/lib/supabase-service", () => {
  const table = (rows: () => Array<Record<string, unknown>>) => {
    const q: Record<string, unknown> = {};
    for (const verb of ["select", "eq", "gt", "order", "limit"]) {
      q[verb] = () => q;
    }
    q.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows(), error: null });
    return q;
  };
  return {
    getServiceClient: () => ({
      from: (name: string) =>
        table(() => (name === "agent_runs" ? h.runRows : h.eventRows)),
    }),
  };
});

const { GET: eventsGET } = await import("@/app/api/agent-runs/[runId]/events/route");
const { GET: issueAgentGET } = await import("@/app/api/issues/[id]/agent/route");

const RUN = "11111111-2222-4333-8444-555555555555";
const ISSUE = "99999999-2222-4333-8444-555555555555";

const events = () =>
  eventsGET(
    // `nextUrl`: the route reads `?after=` there, and a naked `Request` does not carry it.
    Object.assign(new Request("https://minddy.app/x"), {
      nextUrl: new URL("https://minddy.app/x"),
    }) as never,
    { params: Promise.resolve({ runId: RUN }) },
  );

const issueAgent = () =>
  issueAgentGET(new Request("https://minddy.app/x") as never, {
    params: Promise.resolve({ id: ISSUE }),
  });

const runRow = (over: Record<string, unknown>) => ({
  id: "r",
  created_by: "user-1",
  routine_id: null,
  chain_id: null,
  pull_request_id: null,
  prompt: "ma note",
  ...over,
});

beforeEach(() => {
  h.runRows = [];
  h.eventRows = [{ id: "e1", seq: 0, type: "thinking", payload: {}, created_at: "" }];
  getAuthedUser.mockResolvedValue({
    ok: true,
    user: { id: "user-2" },
    // The ticket is read by the RLS client: here it exists and the caller sees it.
    supabase: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: ISSUE } }) }) }),
      }),
    },
  });
  getProjectAccess.mockResolvedValue({ isOwner: false, isMember: true });
  getRun.mockResolvedValue(runRow({ project_id: "proj-1" }));
});

describe("/api/agent-runs/[runId]/events", () => {
  it("404 pour un membre qui n'est pas le créateur — le fil ne sort pas", async () => {
    const res = await events();
    expect(res.status).toBe(404);
  });

  it("200 pour son créateur", async () => {
    getAuthedUser.mockResolvedValue({ ok: true, user: { id: "user-1" } });
    const res = await events();
    expect(res.status).toBe(200);
    expect((await res.json()).events).toHaveLength(1);
  });

  it("200 pour un membre sur un passage de routine", async () => {
    getRun.mockResolvedValue(runRow({ project_id: "proj-1", routine_id: "r-1" }));
    const res = await events();
    expect(res.status).toBe(200);
  });
});

describe("/api/issues/[id]/agent — le panneau d'un ticket public", () => {
  it("ne rend que les runs visibles, et jamais le prompt d'un autre", async () => {
    h.runRows = [
      runRow({ id: "mien", created_by: "user-2" }),
      runRow({ id: "sien", created_by: "user-1", prompt: "note privée" }),
      runRow({ id: "chaine", created_by: "user-1", chain_id: "c-1" }),
      runRow({ id: "routine", created_by: "user-1", routine_id: "r-1" }),
    ];
    const { runs } = (await (await issueAgent()).json()) as {
      runs: Array<Record<string, unknown>>;
    };
    expect(runs.map((r) => r.id)).toEqual(["mien", "chaine", "routine"]);
    expect(JSON.stringify(runs)).not.toContain("note privée");
  });

  it("les colonnes de visibilité ne fuitent pas dans la réponse", async () => {
    // They are read to decide, not to be displayed: the panel receives
    // exactly the same shape as before MIN-332.
    h.runRows = [runRow({ id: "mien", created_by: "user-2" })];
    const { runs } = (await (await issueAgent()).json()) as {
      runs: Array<Record<string, unknown>>;
    };
    expect(runs[0]).not.toHaveProperty("created_by");
    expect(runs[0]).not.toHaveProperty("chain_id");
    expect(runs[0]).not.toHaveProperty("routine_id");
  });
});
