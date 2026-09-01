import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-344 — `/steer` charged the run creator and checked only that account.
 *
 * A message extends an active round or reopens a completed one. Team-readable
 * runs must therefore enforce the caller's plan and budget on every message.
 *
 * A resume also checks the owner's budget because the owner's key executes it
 * and the ledger deliberately charges `created_by`.
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
  it("rejects a failed bootstrap that has no checkpoint", async () => {
    run!.status = "failed";
    run!.checkpoint = null;

    const res = await POST(request(), params);
    expect(res.status).toBe(409);
    expect(messages).toHaveLength(0);
    expect(checkAgentQuota).not.toHaveBeenCalled();
  });

  it("accepts a failed turn when its checkpoint survived", async () => {
    run!.status = "failed";
    run!.checkpoint = { messages: [] };

    const res = await POST(request(), params);
    expect(res.status).toBe(200);
    expect(messages).toHaveLength(1);
  });

  it("rejects a member whose plan does not include agents", async () => {
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

  it("also rejects that member on an active run", async () => {
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

  it("rejects a resume when the caller has exhausted their budget", async () => {
    quotas.set(MEMBER, {
      allowed: false,
      mode: "platform",
      reason: "usage_budget_exceeded",
    });
    const res = await POST(request(), params);
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "quotaExceeded" });
  });

  it("rejects an active-run message when the caller has exhausted their budget", async () => {
    run!.status = "running";
    quotas.set(MEMBER, {
      allowed: false,
      mode: "platform",
      reason: "usage_budget_exceeded",
    });
    const res = await POST(request(), params);
    expect(res.status).toBe(402);
    expect(messages).toHaveLength(0);
  });

  it("rejects a resume when the owner has exhausted their budget", async () => {
    quotas.set(OWNER, {
      allowed: false,
      mode: "platform",
      reason: "usage_budget_exceeded",
    });
    const res = await POST(request(), params);
    expect(res.status).toBe(402);
    expect(stamped).toHaveLength(0);
  });

  it("accepts a resume when both accounts are within budget", async () => {
    const res = await POST(request(), params);
    expect(res.status).toBe(200);
    expect(checkAgentQuota.mock.calls.map(([id]) => id)).toEqual([MEMBER, OWNER]);
    expect(messages).toHaveLength(1);
  });

  it("checks quota once when the caller is the owner", async () => {
    caller = OWNER;
    const res = await POST(request(), params);
    expect(res.status).toBe(200);
    expect(checkAgentQuota.mock.calls.map(([id]) => id)).toEqual([OWNER]);
  });
});
