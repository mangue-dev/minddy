import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE BIRTH OF A TICKET IS WRITTEN BEFORE THE RESPONSE.
 *
 * This file only has one rule, and it cost two symptoms in production:
 *
 * - “created the ticket” came AFTER “assigned” or “ linked" in the
 * timeline — because these writes are done before the response;
 * - and sometimes did not happen at all: a write after the response is
 * best-effort, and when it falls, the ticket no longer has ANY activity.
 *
 * Both are correct in the same place: the `created` event is written on the
 * synchronous path. Hence the form of the assertions — we NEVER execute the
 * callbacks of `after()` here. Everything that the test sees in `issue_events` has therefore,
 * by construction, been written before the function returns.
 */

interface Row extends Record<string, unknown> {}

let eventRows: Row[] = [];
let categoryLinkRows: Row[] = [];
/** The order of writes, as they end up in the timeline. */
let writeLog: string[] = [];
/** Reminders scheduled by `after()` — captured, never played. */
let afterCallbacks: (() => unknown)[] = [];

vi.mock("next/server", () => ({
  after: (cb: () => unknown) => {
    afterCallbacks.push(cb);
  },
}));

const insertedIssue = (row: Row): Row => ({
  ...row,
  id: (row.id as string) ?? "issue-1",
  created_at: "2026-08-10T10:00:00+00:00",
  status: row.status ?? "backlog",
  priority: row.priority ?? "none",
  assignee_id: row.assignee_id ?? null,
  parent_id: row.parent_id ?? null,
});

function table(name: string) {
  const query: Record<string, unknown> = {};
  let inserted: Row[] = [];
  query.select = () => query;
  query.eq = () => query;
  query.is = () => query;
  query.in = () => query;
  query.insert = (rows: Row | Row[]) => {
    inserted = Array.isArray(rows) ? rows : [rows];
    if (name === "issues") {
      inserted = inserted.map(insertedIssue);
    } else if (name === "issue_events") {
      writeLog.push(...inserted.map((r) => `event:${r.type}${r.field ? `/${r.field}` : ""}`));
      eventRows.push(...inserted);
    } else if (name === "issue_categories") {
      categoryLinkRows.push(...inserted);
    }
    return query;
  };
  // The parent of a subticket: the only reading of `issues` of the tested path.
  query.maybeSingle = async () => ({
    data:
      name === "issues"
        ? { id: "parent-1", project_id: "project-1", parent_id: null, objective_id: null }
        : null,
    error: null,
  });
  query.single = async () => ({ data: inserted[0] ?? null, error: null });
  query.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled);
  return query;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (name: string) => table(name),
    rpc: async () => ({ data: 42, error: null }),
  }),
}));

vi.mock("@/lib/server/entitlements", () => ({
  ensureIssueLimit: async () => {},
  canUseSmartAssign: async () => false,
}));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: async () => null }));
vi.mock("@/lib/server/attachments", () => ({
  parseResourcesInput: () => [],
  copyResourcesToProject: async () => [],
  insertAttachments: async () => {},
}));
/** What Smart-fill responds to, when a test calls it. */
let smartFillPatch: Record<string, unknown> = {};
vi.mock("@/lib/server/smart-fill", () => ({ runSmartFill: async () => smartFillPatch }));
vi.mock("@/lib/server/notifications", () => ({ insertNotifications: async () => {} }));
vi.mock("@/lib/server/stat-events", () => ({ insertStatEvents: async () => {} }));
vi.mock("@/lib/server/description-mentions", () => ({
  notifyDescriptionMentions: async () => {},
}));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: () => {} }));
// Webhooks go into their own `after()` — off topic here.
vi.mock("@/lib/server/webhooks", () => ({ dispatchWebhooksForEvents: () => {} }));

// Smart Assign writes BEFORE the response (deterministic case): it is against him that
// order is measured. It only runs on a ticket born without an assignee, excluding
// sorting — what the nominal case below does.
vi.mock("@/lib/server/smart-assign", () => ({
  isSmartAssignEligibleStatus: () => true,
  applySmartAssign: async () => {
    writeLog.push("smart-assign");
    return "member-2";
  },
}));

const { createIssueForProject } = await import("@/lib/server/create-issue");

const create = (input: Record<string, unknown> = {}) =>
  createIssueForProject({
    projectId: "project-1",
    actorId: "member-1",
    input: { title: "Un ticket", ...input },
  });

beforeEach(() => {
  eventRows = [];
  categoryLinkRows = [];
  writeLog = [];
  afterCallbacks = [];
  smartFillPatch = {};
});

describe("createIssueForProject — activité de naissance", () => {
  it("écrit l'événement `created` avant de rendre la main", async () => {
    const result = await create();

    expect(result.ok).toBe(true);
    // Nothing post-response has turned out yet: what is there was written in time.
    expect(afterCallbacks.length).toBeGreaterThan(0);
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0]).toMatchObject({
      issue_id: "issue-1",
      actor_id: "member-1",
      type: "created",
    });
  });

  it("écrit `created` AVANT l'affectation de Smart Assign", async () => {
    await create();

    expect(writeLog).toEqual(["event:created", "smart-assign"]);
  });

  it("annonce le sous-ticket au parent, dans le même geste", async () => {
    await create({ parent_id: "parent-1" });

    expect(eventRows.map((r) => [r.issue_id, r.type])).toEqual([
      ["issue-1", "created"],
      ["parent-1", "sub_issue_added"],
    ]);
  });

  it("dit ce que Smart-fill a posé, après la création", async () => {
    // Smart-fill fills a field left empty — the event follows the `created`.
    smartFillPatch = { priority: "high" };

    await create({ smart_fill: true });

    expect(eventRows.map((r) => [r.type, r.field, r.via_smart_fill ?? false])).toEqual([
      ["created", undefined, false],
      ["updated", "smart_fill", true],
    ]);
  });
});
