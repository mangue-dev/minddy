import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-344 — `/steer` charged the creator of the run and only controlled him.
 *
 * Talking to an agent means making him work: the message extends the round in
 * course, or reopens a completed one. The “agents” right and the ceiling were only checked on the CREATOR of the run. However, three runs on four anchors
 * are readable by the whole team (routine, chain, PR rereading,
 * cf. `canReadAgentRun`): a member whose plan does not include agents had
 * an agent, paid by the next account, and with no limit on his side to him.
 *
 * What these tests fix: the caller must HAVE the agents in his plan, whatever
 * whatever the state of the run; and a recovery looks at BOTH budgets — that of
 * the caller, who triggers the expense, and that of the owner, whose key
 * executes it (the ledger charges to `created_by`, deliberately).
 */

const quotas = new Map<string, Record<string, unknown>>();
const checkAgentQuota = vi.fn(async (userId: string) => {
  return (
    quotas.get(userId) ?? { allowed: true, unlimited: false, mode: "platform" }
  );
});

let run: Record<string, unknown> | null = null;
const stamped: unknown[] = [];
const messages: unknown[] = [];
let caller = "";

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({ ok: true, user: { id: caller } }),
}));
vi.mock("@/lib/server/agent/quota", () => ({
  checkAgentQuota: (userId: string) => checkAgentQuota(userId),
}));
vi.mock("@/lib/server/agent/run-access", () => ({
  canReadAgentRun: async () => true,
}));
vi.mock("@/lib/server/agent/runs", () => ({
  getRun: async () => run,
  activeRunForIssue: async () => null,
  activeRunForRoutine: async () => null,
  newerRunExistsForIssue: async () => false,
  runIsLatestOnAnchor: async () => true,
  insertLatestRunMessage: async (...args: unknown[]) => {
    messages.push(args);
    return "inserted";
  },
  bumpRunActivity: async () => {},
  stampRun: async (...args: unknown[]) => {
    stamped.push(args);
    return true;
  },
}));
vi.mock("@/lib/server/agent/launch", () => ({ kickAgentDrain: () => {} }));
vi.mock("@/lib/server/agent/issue-status-sync", () => ({
  syncIssueStatusOnAgentStart: async () => {},
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));

const { POST } = await import("@/app/api/agent-runs/[runId]/steer/route");

const OWNER = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function request(message = "continue") {
  return new Request("http://localhost/api/agent-runs/x/steer", {
    method: "POST",
    body: JSON.stringify({ message }),
  }) as unknown as Parameters<typeof POST>[0];
}

const params = { params: Promise.resolve({ runId: RUN_ID }) };

beforeEach(() => {
  caller = MEMBER;
  quotas.clear();
  stamped.length = 0;
  messages.length = 0;
  checkAgentQuota.mockClear();
  run = {
    id: RUN_ID,
    status: "completed",
    created_by: OWNER,
    issue_id: null,
    routine_id: "routine-1",
    project_id: "projet",
    pr_state: null,
    created_at: "2026-08-01T00:00:00.000Z",
  };
});

describe("POST /api/agent-runs/[runId]/steer", () => {
  it("refuse un membre dont le plan n'inclut pas les agents", async () => {
    quotas.set(MEMBER, {
      allowed: false,
      mode: "platform",
      reason: "agents_not_in_plan",
    });
    const res = await POST(request(), params);
    expect(res.status).toBe(402);
    expect(messages).toHaveLength(0);
    expect(stamped).toHaveLength(0);
  });

  it("le refuse AUSSI sur un run qui tourne — un message le fait travailler", async () => {
    run!.status = "running";
    quotas.set(MEMBER, {
      allowed: false,
      mode: "platform",
      reason: "agents_not_in_plan",
    });
    const res = await POST(request(), params);
    expect(res.status).toBe(402);
    expect(messages).toHaveLength(0);
  });

  it("refuse une reprise quand l'appelant a épuisé SON budget", async () => {
    quotas.set(MEMBER, {
      allowed: false,
      mode: "platform",
      reason: "usage_budget_exceeded",
    });
    const res = await POST(request(), params);
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "quotaExceeded" });
  });

  it("refuse encore quand c'est le propriétaire qui n'a plus rien — c'est sa clé qui exécute", async () => {
    quotas.set(OWNER, {
      allowed: false,
      mode: "platform",
      reason: "usage_budget_exceeded",
    });
    const res = await POST(request(), params);
    expect(res.status).toBe(402);
    expect(stamped).toHaveLength(0);
  });

  it("laisse passer quand les deux comptes sont en règle", async () => {
    const res = await POST(request(), params);
    expect(res.status).toBe(200);
    expect(checkAgentQuota.mock.calls.map(([id]) => id)).toEqual([MEMBER, OWNER]);
    expect(messages).toHaveLength(1);
  });

  it("ne demande qu'une fois le quota quand l'appelant EST le propriétaire", async () => {
    caller = OWNER;
    const res = await POST(request(), params);
    expect(res.status).toBe(200);
    expect(checkAgentQuota.mock.calls.map(([id]) => id)).toEqual([OWNER]);
  });
});
