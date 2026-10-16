import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

type Result = { data: unknown; error: { message: string; code?: string } | null };
const h = vi.hoisted(() => ({
  started: [] as string[],
  runs: null as Promise<Result> | null,
  pins: null as Result | null,
}));

function query(table: string) {
  const builder = {
    select: () => builder,
    is: () => builder,
    eq: () => builder,
    order: () => builder,
    then: (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) => {
      h.started.push(table);
      const result = table === "agent_runs" ? h.runs! : Promise.resolve(h.pins!);
      return result.then(resolve, reject);
    },
  };
  return builder;
}

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({
    ok: true,
    user: { id: "user-1" },
    supabase: { from: query },
  }),
}));
vi.mock("@/lib/server/issue-store", () => ({ loadIssueTitles: async () => new Map() }));
vi.mock("@/lib/server/agent/run-launch-content", () => ({
  decodeAgentLaunch: async (row: unknown) => row,
  legacyAgentLaunchSchema: () => false,
}));
vi.mock("@/lib/server/agent/run-title-content", () => ({ decodeAgentTitle: async (row: unknown) => row }));
vi.mock("@/lib/server/agent/run-pr-url-content", () => ({ decodeAgentPrUrl: async (row: unknown) => row }));
vi.mock("@/lib/server/agent/pull-request-url-content", () => ({
  decodePullRequestUrlRow: async (row: unknown) => row,
}));
vi.mock("@/lib/server/agent/pull-request-content", () => ({
  decodePullRequestContentRow: async (row: unknown) => row,
}));
vi.mock("@/lib/server/project-content", () => ({
  decodeProjectName: async (project: { name: string }) => project.name,
}));

const { GET } = await import("@/app/api/agent-runs/route");
const request = () => new NextRequest("https://fixture.invalid/api/agent-runs");
const run = (id: string, conversationId: string, createdAt: string) => ({
  id, project_id: "project-a", conversation_id: conversationId, parent_numo_turn_id: null,
  issue_id: null, pull_request_id: null, status: "completed", model: null, agent_engine: null,
  triggered_by: "chat", prompt: "Synthetic note", prompt_mentions: null, title: id,
  pr_number: null, pr_url: null, pr_state: null, created_at: createdAt, updated_at: createdAt,
  completed_at: createdAt, awaiting_input: false, conversation: null, issue: null,
  project: null, pull_request: null,
});

beforeEach(() => {
  h.started = [];
  h.runs = null;
  h.pins = { data: [], error: null };
});

it("reads the caller's pins while the runs are still loading", async () => {
  let resolveRuns!: (value: Result) => void;
  h.runs = new Promise((resolve) => { resolveRuns = resolve; });
  h.pins = { data: [{ conversation_id: "conversation-old" }], error: null };

  const pending = GET(request());
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(h.started).toEqual(["agent_runs", "agent_conversation_pins"]);
  resolveRuns({
    data: [
      run("run-new", "conversation-new", "2026-10-02T00:00:00.000Z"),
      run("run-old", "conversation-old", "2026-10-01T00:00:00.000Z"),
    ],
    error: null,
  });

  const response = await pending;
  expect(response.status).toBe(200);
  const { sessions } = await response.json();
  expect(sessions.map((session: { runId: string; pinned: boolean }) =>
    [session.runId, session.pinned])).toEqual([["run-old", true], ["run-new", false]]);
});

it("reports a runs failure before a pins failure", async () => {
  h.runs = Promise.resolve({ data: null, error: { message: "runs unavailable" } });
  h.pins = { data: null, error: { message: "pins unavailable" } };
  const failedRuns = await GET(request());
  expect(failedRuns.status).toBe(500);
  expect(await failedRuns.json()).toEqual({ error: "runs unavailable" });

  h.runs = Promise.resolve({ data: [], error: null });
  const failedPins = await GET(request());
  expect(failedPins.status).toBe(500);
  expect(await failedPins.json()).toEqual({ error: "pins unavailable" });
});
