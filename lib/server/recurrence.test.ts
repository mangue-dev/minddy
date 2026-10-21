import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Closing a recurring issue (MIN-136) through the real write core, with the
 * database kept in memory. Covers what the closing request itself decides:
 * the closing date of a repeated `done` (MIN-699), the state the successor is
 * built from (MIN-700), and the day of the month it keeps (MIN-697).
 */

interface Row extends Record<string, unknown> {}

let db: Record<string, Row[]> = {};
let created: Array<{ input: Row; recurrenceSeriesId: string | null }> = [];

function makeQuery(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let columns = "";
  let mode: "select" | "update" = "select";
  let payload: Row = {};
  let order: { column: string; ascending: boolean } | null = null;
  let limit = Infinity;

  const matching = () => {
    const rows = (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
    if (order) {
      const { column, ascending } = order;
      rows.sort((a, b) => {
        const diff = Date.parse(a[column] as string) - Date.parse(b[column] as string);
        return ascending ? diff : -diff;
      });
    }
    return rows.slice(0, limit);
  };

  const hydrate = (row: Row | undefined) => {
    if (!row) return null;
    if (table === "issues" && columns.includes("projects(")) {
      const project = (db.projects ?? []).find((p) => p.id === row.project_id);
      return { ...row, projects: project ?? null };
    }
    return { ...row };
  };

  const run = () => {
    if (mode === "update") {
      const matched = matching();
      matched.forEach((r) => Object.assign(r, payload, { updated_at: `${r.updated_at}+` }));
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
    neq: (col: string, val: unknown) => {
      filters.push((r) => r[col] !== val);
      return q;
    },
    is: (col: string, val: unknown) => {
      filters.push((r) => (r[col] ?? null) === val);
      return q;
    },
    not: (col: string, op: string, val: unknown) => {
      if (op === "is") filters.push((r) => (r[col] ?? null) !== val);
      return q;
    },
    lt: (col: string, val: string) => {
      filters.push((r) => r[col] != null && Date.parse(r[col] as string) < Date.parse(val));
      return q;
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
      return q;
    },
    or: (expr: string) => {
      // Only the `id.eq.X,recurrence_series_id.eq.X` form is used here.
      const clauses = expr.split(",").map((c) => {
        const [col, , val] = c.split(".");
        return [col, val] as const;
      });
      filters.push((r) => clauses.some(([col, val]) => r[col] === val));
      return q;
    },
    order: (column: string, opts?: { ascending?: boolean }) => {
      order = { column, ascending: opts?.ascending ?? true };
      return q;
    },
    limit: (n: number) => {
      limit = n;
      return q;
    },
    range: () => q,
    update: (values: Row) => {
      mode = "update";
      payload = values;
      return q;
    },
    insert: () => q,
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
  auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
};

// Deferred side effects are collected and awaited by `patch`, so the
// successor exists when it returns.
const deferred: unknown[] = [];
vi.mock("next/server", () => ({ after: (work: () => unknown) => void deferred.push(work()) }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/issue-events", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  insertEvents: async () => {},
}));
vi.mock("@/lib/server/create-issue", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createIssueForProject: async ({
    input,
    recurrenceSeriesId,
  }: {
    input: Row;
    recurrenceSeriesId: string | null;
  }) => {
    created.push({ input, recurrenceSeriesId });
    const row = { id: `issue-new-${created.length}`, ...input };
    db.issues.push({ ...row, recurrence_series_id: recurrenceSeriesId, deleted_at: null });
    return { ok: true, issue: row };
  },
}));
vi.mock("@/lib/server/notifications", () => ({ insertNotifications: async () => {} }));
vi.mock("@/lib/server/stat-events", () => ({ insertStatEvents: async () => {} }));
vi.mock("@/lib/server/description-mentions", () => ({
  notifyDescriptionMentions: async () => {},
}));
vi.mock("@/lib/server/page-links", () => ({ queuePageLinks: () => {} }));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: () => {} }));
vi.mock("@/lib/server/smart-assign", () => ({
  isSmartAssignEligibleStatus: () => false,
  applySmartAssign: async () => null,
}));
vi.mock("@/lib/server/cycles", () => ({ scheduleCycleCapture: () => {} }));
vi.mock("@/lib/server/feedback/status-sync", () => ({
  scheduleFeedbackStatusSync: () => {},
}));
vi.mock("@/lib/server/git/issue-push", () => ({ scheduleRemoteStatusPush: () => {} }));
vi.mock("@/lib/server/entitlements", () => ({ ensureIssueLimit: async () => {} }));

const { updateIssueFields } = await import("@/lib/server/update-issue");

const PROJECT = "project-1";
const ME = "user-me";

const issue = (overrides: Row): Row => ({
  id: "issue-1",
  project_id: PROJECT,
  number: 1,
  title: "Old title",
  description: null,
  status: "todo",
  priority: "medium",
  effort: null,
  assignee_id: null,
  objective_id: null,
  cycle_id: null,
  parent_id: null,
  duplicate_of_id: null,
  automation_override: null,
  due_date: null,
  recurrence: null,
  recurrence_series_id: null,
  completed_at: null,
  plan: null,
  updated_at: "2026-10-01T00:00:00+00:00",
  deleted_at: null,
  ...overrides,
});

const issueRow = (id = "issue-1") => db.issues.find((r) => r.id === id)!;

async function patch(input: Record<string, unknown>, issueId = "issue-1") {
  const result = await updateIssueFields({ issueId, actorId: ME, input });
  await Promise.all(deferred.splice(0));
  return result;
}

beforeEach(() => {
  created = [];
  db = {
    projects: [{ id: PROJECT, name: "Project", owner_id: ME, deleted_at: null }],
    project_members: [],
    issues: [],
    issue_categories: [],
    issue_events: [],
  };
});

describe("completed_at on a status write (MIN-699)", () => {
  it("keeps the original closing date when a done issue receives done again", async () => {
    db.issues.push(issue({ status: "done", completed_at: "2025-01-01T10:00:00.000Z" }));

    const result = await patch({ status: "done" });

    expect(result.ok).toBe(true);
    expect(issueRow().completed_at).toBe("2025-01-01T10:00:00.000Z");
  });

  it("stamps a new closing date on a real transition into done", async () => {
    db.issues.push(issue({ status: "done", completed_at: "2025-01-01T10:00:00.000Z" }));

    await patch({ status: "todo" });
    expect(issueRow().completed_at).toBeNull();

    await patch({ status: "done" });
    expect(issueRow().completed_at).not.toBe("2025-01-01T10:00:00.000Z");
    expect(Date.parse(issueRow().completed_at as string)).toBeGreaterThan(
      Date.parse("2026-01-01T00:00:00.000Z"),
    );
  });
});

describe("the next occurrence comes from the closed state (MIN-700)", () => {
  it("carries the title and cadence changed in the closing request", async () => {
    db.issues.push(
      issue({ recurrence: "weekly", due_date: "2099-01-05T09:00:00.000Z" }),
    );

    await patch({ status: "done", recurrence: "monthly", title: "New title" });

    expect(created).toHaveLength(1);
    expect(created[0].input).toMatchObject({
      title: "New title",
      recurrence: "monthly",
      due_date: "2099-02-05T09:00:00.000Z",
    });
    expect(created[0].recurrenceSeriesId).toBe("issue-1");
    // The closed issue hands its cadence over to its successor.
    expect(issueRow().recurrence).toBeNull();
  });

  it("starts a series when the cadence is set in the closing request", async () => {
    db.issues.push(issue({ due_date: "2099-01-05T09:00:00.000Z" }));

    await patch({ status: "done", recurrence: "weekly" });

    expect(issueRow().due_date).toBe("2099-01-05T09:00:00.000Z");
    expect(created).toHaveLength(1);
    expect(created[0].input).toMatchObject({
      recurrence: "weekly",
      due_date: "2099-01-12T09:00:00.000Z",
    });
  });

  it("creates nothing when the closing request removes the cadence", async () => {
    db.issues.push(
      issue({ recurrence: "weekly", due_date: "2099-01-05T09:00:00.000Z" }),
    );

    await patch({ status: "done", recurrence: null });

    expect(created).toEqual([]);
  });

  it("creates a single occurrence when done is sent twice", async () => {
    db.issues.push(
      issue({ recurrence: "weekly", due_date: "2099-01-05T09:00:00.000Z" }),
    );

    await patch({ status: "done" });
    await patch({ status: "done" });

    expect(created).toHaveLength(1);
  });
});

describe("the next occurrence keeps the series' day of the month (MIN-697)", () => {
  it("returns to the 31st after February", async () => {
    // Year 2099: every deadline stays ahead of the clock, no catch-up.
    db.issues.push(
      issue({
        id: "issue-jan",
        status: "done",
        due_date: "2099-01-31T09:00:00+00:00",
      }),
      issue({
        id: "issue-feb",
        due_date: "2099-02-28T09:00:00+00:00",
        recurrence: "monthly",
        recurrence_series_id: "issue-jan",
      }),
    );

    await patch({ status: "done" }, "issue-feb");

    expect(created).toHaveLength(1);
    expect(created[0].input.due_date).toBe("2099-03-31T09:00:00.000Z");
    expect(created[0].recurrenceSeriesId).toBe("issue-jan");
  });

  it("keeps the 28th of a series that never had another day", async () => {
    db.issues.push(
      issue({
        id: "issue-feb",
        due_date: "2099-02-28T09:00:00+00:00",
        recurrence: "monthly",
      }),
    );

    await patch({ status: "done" }, "issue-feb");

    expect(created[0].input.due_date).toBe("2099-03-28T09:00:00.000Z");
  });
});
