import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Smart Fill re-evaluation through the real issue write core (MIN-750), with
 * the database kept in memory like `recurrence.test.ts`: what a write by hand
 * takes back from Smart Fill, what a re-evaluation write keeps and says, and
 * which writes queue a new pass.
 */

interface Row extends Record<string, unknown> {}

let db: Record<string, Row[]> = {};
let events: Row[] = [];

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
  // `release_smart_fill_fields`, as the SQL function does it.
  rpc: async (name: string, args: { p_issue_id: string; p_fields: string[] }) => {
    if (name === "release_smart_fill_fields") {
      const row = db.issue_smart_fill.find((r) => r.issue_id === args.p_issue_id);
      if (row) row.fields = (row.fields as string[]).filter((f) => !args.p_fields.includes(f));
      db.issue_smart_fill = db.issue_smart_fill.filter((r) => (r.fields as string[]).length > 0);
    }
    return { data: null, error: null };
  },
};

const deferred: unknown[] = [];
vi.mock("next/server", () => ({ after: (work: () => unknown) => void deferred.push(work()) }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/issue-events", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  insertEvents: async (_service: unknown, rows: Row[]) => {
    events.push(...rows);
  },
}));
vi.mock("@/lib/server/issue-relation-inference", () => ({ scheduleIssueAiPass: () => {} }));
vi.mock("@/lib/server/description-collaboration", () => ({ syncDescriptionWrite: async () => {} }));
vi.mock("@/lib/server/notifications", () => ({ insertNotifications: async () => {} }));
vi.mock("@/lib/server/stat-events", () => ({ insertStatEvents: async () => {} }));
vi.mock("@/lib/server/description-mentions", () => ({ notifyDescriptionMentions: async () => {} }));
vi.mock("@/lib/server/page-links", () => ({ queuePageLinks: () => {} }));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: () => {} }));
vi.mock("@/lib/server/smart-assign", () => ({
  isSmartAssignEligibleStatus: () => false,
  applySmartAssign: async () => null,
}));
vi.mock("@/lib/server/cycles", () => ({ scheduleCycleCapture: () => {} }));
vi.mock("@/lib/server/feedback/status-sync", () => ({ scheduleFeedbackStatusSync: () => {} }));
vi.mock("@/lib/server/git/issue-push", () => ({ scheduleRemoteStatusPush: () => {} }));

const { updateIssueFields } = await import("@/lib/server/update-issue");

const PROJECT = "project-1";
const ME = "user-me";

async function patch(input: Record<string, unknown>, options: { viaSmartFill?: boolean } = {}) {
  const result = await updateIssueFields({ issueId: "issue-1", actorId: ME, input, ...options });
  await Promise.all(deferred.splice(0));
  return result;
}

const ownership = () => db.issue_smart_fill[0];

beforeEach(() => {
  events = [];
  db = {
    projects: [{ id: PROJECT, name: "Project", owner_id: ME, deleted_at: null }],
    project_members: [],
    objectives: [
      { id: "objective-a", project_id: PROJECT },
      { id: "objective-b", project_id: PROJECT },
    ],
    issues: [
      {
        id: "issue-1",
        project_id: PROJECT,
        number: 1,
        title: "Title",
        description: null,
        status: "todo",
        priority: "medium",
        effort: "s",
        objective_id: "objective-a",
        assignee_id: null,
        cycle_id: null,
        parent_id: null,
        due_date: null,
        recurrence: null,
        plan: null,
        updated_at: "2026-10-21T00:00:00+00:00",
        deleted_at: null,
      },
    ],
    issue_categories: [],
    issue_smart_fill: [
      {
        issue_id: "issue-1",
        project_id: PROJECT,
        fields: ["priority", "effort", "objective_id", "category_ids"],
        reevaluate_at: null,
        reevaluate_by: null,
      },
    ],
  };
});

describe("Smart Fill ownership on issue writes (MIN-750)", () => {
  it("takes back the properties someone changed by hand", async () => {
    await patch({ priority: "urgent", effort: "s", status: "in_progress" });

    // Effort was sent with its current value: nobody changed it.
    expect(ownership().fields).toEqual(["effort", "objective_id", "category_ids"]);
  });

  it("drops the row once every property was taken back", async () => {
    db.issue_smart_fill[0].fields = ["priority"];

    await patch({ priority: "high" });

    expect(db.issue_smart_fill).toEqual([]);
  });

  it("keeps ownership of what a re-evaluation writes and names Smart Fill", async () => {
    await patch({ priority: "high" }, { viaSmartFill: true });

    expect(ownership().fields).toEqual(["priority", "effort", "objective_id", "category_ids"]);
    expect(events).toEqual([
      expect.objectContaining({ field: "priority", from_value: "medium", to_value: "high", via_smart_fill: true }),
    ]);
  });

  it("tells both objectives when a re-evaluation moves the issue", async () => {
    await patch({ objective_id: "objective-b" }, { viaSmartFill: true });

    expect(events.map((e) => [e.issue_id ?? e.objective_id, e.type, e.field ?? null, e.via_smart_fill]))
      .toEqual([
        ["issue-1", "updated", "objective_id", true],
        ["objective-a", "objective_issue_removed", null, true],
        ["objective-b", "objective_issue_added", null, true],
      ]);
  });

  it("writes no objective events for a move by hand", async () => {
    await patch({ objective_id: "objective-b" });

    expect(events.map((e) => e.type)).toEqual(["updated"]);
    expect(ownership().fields).not.toContain("objective_id");
  });

  it("queues a pass five minutes after a title or description edit, as the editor", async () => {
    const before = Date.now();

    await patch({ description: "More detail" });

    expect(ownership().reevaluate_by).toBe(ME);
    const due = Date.parse(ownership().reevaluate_at as string);
    expect(due).toBeGreaterThanOrEqual(before + 5 * 60_000);
    expect(due).toBeLessThan(before + 6 * 60_000);
  });

  it("queues nothing for other edits", async () => {
    await patch({ status: "in_progress" });

    expect(ownership().reevaluate_at).toBeNull();
  });
});
