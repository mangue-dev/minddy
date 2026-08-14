import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-344 — `/steer` facturait le créateur du run et ne contrôlait que lui.
 *
 * Parler à un agent, c'est le faire travailler : le message allonge le tour en
 * cours, ou en rouvre un terminé. Le droit « agents » et le plafond n'étaient
 * pourtant vérifiés que sur le CRÉATEUR du run. Or trois runs sur quatre ancrages
 * sont lisibles par toute l'équipe (routine, chaîne, relecture de PR,
 * cf. `canReadAgentRun`) : un membre dont le plan n'inclut pas les agents avait
 * un agent, payé par le compte d'à côté, et sans limite de son côté à lui.
 *
 * Ce que ces tests figent : l'appelant doit AVOIR les agents à son plan, quel
 * que soit l'état du run ; et une reprise regarde les DEUX budgets — celui de
 * l'appelant, qui déclenche la dépense, et celui du propriétaire, dont la clé
 * l'exécute (le ledger impute au `created_by`, délibérément).
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
  insertRunMessage: async (...args: unknown[]) => {
    messages.push(args);
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
