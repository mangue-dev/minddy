import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * When the issue write core hands an issue to Smart Assign (MIN-31, MIN-811),
 * with the database kept in memory like `update-issue-smart-fill.test.ts`:
 * leaving triage unassigned, and clearing the assignee past triage, which the
 * pickers present as choosing "Smart Assign". The run itself (and its
 * re-check of the project toggle) is `smart-assign.test.ts`'s concern.
 */

interface Row extends Record<string, unknown> {}

let db: Record<string, Row[]> = {};

function makeQuery(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let columns = "";
  let mode: "select" | "update" = "select";
  let payload: Row = {};

  const matching = () => (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
  const hydrate = (row: Row | undefined) => {
    if (!row) return null;
    if (table === "issues" && columns.includes("projects(")) {
      return { ...row, projects: (db.projects ?? []).find((p) => p.id === row.project_id) ?? null };
    }
    return { ...row };
  };
  const run = () => {
    if (mode === "update") {
      const matched = matching();
      matched.forEach((r) =>
        Object.assign(r, payload, table === "issues" ? { updated_at: `${r.updated_at}+` } : {}),
      );
      return { data: hydrate(matched[0]), error: null };
    }
    return { data: hydrate(matching()[0]), error: null };
  };

  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: (cols?: string) => {
      if (typeof cols === "string") columns = cols;
      return q;
    },
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return q;
    },
    is: (col: string, val: unknown) => {
      filters.push((r) => (r[col] ?? null) === val);
      return q;
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
      return q;
    },
    update: (values: Row) => {
      mode = "update";
      payload = values;
      return q;
    },
    maybeSingle: async () => run(),
    single: async () => run(),
    then: (onFulfilled: (value: unknown) => unknown) => {
      const result = mode === "select" ? { data: matching(), error: null } : run();
      return Promise.resolve(result).then(onFulfilled);
    },
  });
  return q;
}

const service = {
  from: (table: string) => makeQuery(table),
  rpc: async () => ({ data: null, error: null }),
};

const deferred: unknown[] = [];
const smartAssignRuns: Array<Record<string, unknown>> = [];
vi.mock("next/server", () => ({ after: (work: () => unknown) => void deferred.push(work()) }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/issue-events", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  insertEvents: async () => {},
}));
vi.mock("@/lib/server/issue-relation-inference", () => ({ scheduleIssueAiPass: () => {} }));
vi.mock("@/lib/server/description-collaboration", () => ({ syncDescriptionWrite: async () => {} }));
vi.mock("@/lib/server/notifications", () => ({ insertNotifications: async () => {} }));
vi.mock("@/lib/server/stat-events", () => ({ insertStatEvents: async () => {} }));
vi.mock("@/lib/server/description-mentions", () => ({ notifyDescriptionMentions: async () => {} }));
vi.mock("@/lib/server/page-links", () => ({ queuePageLinks: () => {} }));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: () => {} }));
vi.mock("@/lib/server/smart-assign", () => ({
  // The real rule, without the module's server dependencies.
  isSmartAssignEligibleStatus: (status: unknown) =>
    typeof status === "string" && !["triage", "canceled", "duplicate"].includes(status),
  applySmartAssign: async (params: Record<string, unknown>) => {
    smartAssignRuns.push(params);
    return "user-picked";
  },
}));
vi.mock("@/lib/server/cycles", () => ({ scheduleCycleCapture: () => {} }));
vi.mock("@/lib/server/feedback/status-sync", () => ({ scheduleFeedbackStatusSync: () => {} }));
vi.mock("@/lib/server/git/issue-push", () => ({ scheduleRemoteStatusPush: () => {} }));

const { updateIssueFields } = await import("@/lib/server/update-issue");

const PROJECT = "project-1";
const ME = "user-me";
const TEAMMATE = "user-teammate";

async function patch(input: Record<string, unknown>) {
  const result = await updateIssueFields({ issueId: "issue-1", actorId: ME, input });
  await Promise.all(deferred.splice(0));
  return result;
}

function seed(issue: { status: string; assignee_id: string | null }) {
  db = {
    projects: [{ id: PROJECT, name: "Project", owner_id: ME, deleted_at: null }],
    project_members: [{ project_id: PROJECT, user_id: TEAMMATE, role: "member" }],
    issues: [
      {
        id: "issue-1",
        project_id: PROJECT,
        number: 1,
        title: "Title",
        description: null,
        priority: "medium",
        effort: "s",
        objective_id: null,
        cycle_id: null,
        parent_id: null,
        due_date: null,
        recurrence: null,
        plan: null,
        updated_at: "2026-10-27T00:00:00+00:00",
        deleted_at: null,
        ...issue,
      },
    ],
    issue_categories: [],
    issue_smart_fill: [],
  };
}

beforeEach(() => {
  smartAssignRuns.length = 0;
});

describe("Smart Assign triggers on issue writes", () => {
  it("runs when someone clears the assignee of an issue past triage (MIN-811)", async () => {
    seed({ status: "todo", assignee_id: TEAMMATE });

    const result = await patch({ assignee_id: null });

    expect(smartAssignRuns).toEqual([
      { issueId: "issue-1", projectId: PROJECT, triggerActorId: ME, trigger: "unassign" },
    ]);
    // The response carries the assignee the run wrote, not the empty one.
    expect(JSON.stringify(result)).toContain("user-picked");
  });

  it("runs once, as a triage exit, when both happen in one write", async () => {
    seed({ status: "triage", assignee_id: TEAMMATE });

    await patch({ status: "todo", assignee_id: null });

    expect(smartAssignRuns.map((run) => run.trigger)).toEqual(["triage_exit"]);
  });

  it("leaves a triaged or canceled issue unassigned", async () => {
    seed({ status: "triage", assignee_id: TEAMMATE });
    await patch({ assignee_id: null });

    seed({ status: "canceled", assignee_id: TEAMMATE });
    await patch({ assignee_id: null });

    expect(smartAssignRuns).toEqual([]);
  });

  it("does not run for another edit of an already unassigned issue", async () => {
    seed({ status: "todo", assignee_id: null });

    await patch({ priority: "high" });
    await patch({ assignee_id: null });

    expect(smartAssignRuns).toEqual([]);
  });
});
