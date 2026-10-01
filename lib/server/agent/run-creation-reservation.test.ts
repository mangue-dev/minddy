import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseOperationError } from "@/lib/server/failure-diagnostics";

const h = vi.hoisted(() => ({
  reservedUsd: 0,
  inserts: 0,
  tail: Promise.resolve(),
  error: null as null | { code: string; message: string; details?: string },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => {
      throw new Error("platform-funded runs must not use a plain insert");
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("create_agent_run_with_budget");
      if (h.error) return { data: null, error: h.error, status: 400 };
      let release!: () => void;
      const previous = h.tail;
      h.tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        const cap = Number(args.p_budget_cap);
        const requested = Number(args.p_requested_budget);
        const granted = Math.min(requested, Math.max(0, cap - h.reservedUsd));
        if (granted <= 0) {
          return { data: { run: null, granted_budget_usd: 0 }, error: null };
        }
        h.reservedUsd += granted;
        h.inserts++;
        return {
          data: {
            run: {
              ...(args.p_values as Record<string, unknown>),
              id: `run-${h.inserts}`,
              managed_budget_usd: granted,
            },
            granted_budget_usd: granted,
          },
          error: null,
        };
      } finally {
        release();
      }
    },
  }),
}));

import {
  createRun,
  ManagedBudgetUnavailableError,
  type CreateRunInput,
} from "./runs";

const input: CreateRunInput = {
  projectId: "00000000-0000-4000-8000-000000000001",
  issueId: null,
  repoLinkId: null,
  connectionId: null,
  repoProvider: null,
  repoExternalId: null,
  createdBy: "00000000-0000-4000-8000-000000000002",
  prompt: "Implement the fix",
  model: "openai/gpt-5.6",
  modelForced: false,
  reasoningLevel: "medium",
  keyMode: "platform",
  workerModelProvider: "openrouter",
  triggeredBy: "button",
  managedBudget: {
    periodStart: "2026-08-01T00:00:00.000Z",
    accountCapUsd: 5,
    requestedUsd: 5,
  },
};

beforeEach(() => {
  h.reservedUsd = 0;
  h.inserts = 0;
  h.tail = Promise.resolve();
  h.error = null;
});

describe("managed-AI run creation", () => {
  it("preserves database codes and constraints without retaining failed row details", async () => {
    h.error = { code: "23514",
      message: 'new row violates check constraint "agent_runs_delegation_brief_check"',
      details: "Private row values" };
    let caught: unknown;
    try { await createRun(input); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(DatabaseOperationError);
    expect(caught).toMatchObject({ operation: "create_agent_run", diagnostics: {
      kind: "database_constraint", code: "23514", status: 400,
      constraint: "agent_runs_delegation_brief_check",
    } });
    expect(JSON.stringify(caught)).not.toContain("Private row values");
    expect(h.inserts).toBe(0);
  });
  it("does not let parallel launches reserve more than the account cap", async () => {
    const outcomes = await Promise.allSettled([createRun(input), createRun(input)]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : null).toBeInstanceOf(
      ManagedBudgetUnavailableError,
    );
    expect(h.reservedUsd).toBe(5);
    expect(h.inserts).toBe(1);
  });
});
