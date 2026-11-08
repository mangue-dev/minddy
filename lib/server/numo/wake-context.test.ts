import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));

import {
  dropRepeatedAssignments,
  readKind,
  summarizeWakeEvent,
  type WakeEventRow,
  type WakeLookup,
  type WakeObject,
} from "./wake-context";

const ME = "11111111-1111-4111-8111-111111111111";
const SAM = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";

function row(overrides: Partial<WakeEventRow>): WakeEventRow {
  return {
    id: 1,
    project_id: PROJECT,
    subject_type: "issue",
    subject_id: "issue-1",
    event: "issue.updated",
    before_state: {},
    after_state: {},
    actor_id: SAM,
    actor_kind: "user",
    changed_fields: null,
    recipient_id: null,
    created_at: "2026-11-08T10:00:00.000Z",
    ...overrides,
  };
}

function lookup(objects: Record<string, WakeObject> = {}, ownerId = SAM): WakeLookup {
  return {
    userId: ME,
    projects: new Map([[PROJECT, { key: "MIN", owner_id: ownerId }]]),
    objects: new Map(Object.entries(objects)),
    names: new Map([[SAM, "Sam Lee"]]),
  };
}

describe("summarizeWakeEvent", () => {
  it("names the object, the actor and the user's relation", () => {
    const summary = summarizeWakeEvent(row({
      event: "issue.status_changed",
      before_state: { status: "in_review" },
      after_state: { status: "done", priority: "medium" },
      changed_fields: ["status", "position", "updated_by"],
    }), lookup({
      "issue:issue-1": {
        title: "Fix the login redirect",
        reference: "MIN-42",
        people: { assignee: ME, creator: SAM },
        priority: "medium",
      },
    }));
    expect(summary).toEqual({
      id: 1,
      type: "issue.status_changed",
      project: "MIN",
      object: { kind: "issue", reference: "MIN-42", title: "Fix the login redirect" },
      actor: "Sam Lee",
      changed: ["status"],
      details: { status: "in_review → done", priority: "medium" },
      relations: ["assignee"],
      signals: [],
      at: "2026-11-08T10:00:00.000Z",
    });
  });

  it("flags serious events", () => {
    const failed = summarizeWakeEvent(row({
      subject_type: "routine", subject_id: "routine-1", event: "routine.finished",
      actor_id: null, actor_kind: "system", after_state: { status: "failed", owner: ME },
    }), lookup());
    expect(failed.signals).toEqual(["routine_failed"]);
    expect(failed.relations).toEqual(["routine_owner"]);
    expect(failed.actor).toBe("automation");

    const rejected = summarizeWakeEvent(row({
      event: "issue.pull_request", after_state: { type: "pr_changes_requested" },
    }), lookup());
    expect(rejected.signals).toEqual(["pull_request_changes_requested"]);

    const urgent = summarizeWakeEvent(row({ event: "issue.created", after_state: { priority: "urgent" } }), lookup());
    expect(urgent.signals).toEqual(["urgent_priority"]);
    // An urgent issue edited for something else is not news about its priority.
    const edited = summarizeWakeEvent(row({ after_state: { priority: "urgent" }, changed_fields: ["title"] }), lookup());
    expect(edited.signals).toEqual([]);

    const sensitive = summarizeWakeEvent(row({
      subject_type: "feedback", subject_id: "post-1", event: "feedback.received", actor_id: null, actor_kind: "system",
    }), lookup({ "feedback:post-1": { title: "Password reset leaks emails", people: {}, sensitivity: "security" } }, ME));
    expect(sensitive.signals).toEqual(["sensitive_feedback"]);
    expect(sensitive.relations).toEqual(["board_owner"]);
  });

  it("marks a mention for its recipient only", () => {
    expect(summarizeWakeEvent(row({ event: "mention.received", recipient_id: ME }), lookup()).relations)
      .toEqual(["mentioned"]);
    expect(summarizeWakeEvent(row({ event: "issue.comment_added" }), lookup()).relations).toEqual([]);
  });

  it("keeps an event whose object is not readable", () => {
    const summary = summarizeWakeEvent(row({ subject_type: "page", subject_id: "page-1", event: "page.arrived" }), lookup());
    expect(summary.object).toEqual({ kind: "page", reference: null, title: null });
  });
});

describe("the loader's edge cases", () => {
  it("tells the user they were unassigned", () => {
    const summary = summarizeWakeEvent(row({
      before_state: { assignee: ME }, after_state: { assignee: SAM }, changed_fields: ["assignee_id"],
    }), lookup({ "issue:issue-1": { title: "Ship the API", people: { assignee: SAM } } }));
    expect(summary.relations).toEqual(["former_assignee"]);
    expect(summary.details).toMatchObject({ assignee: "the user → Sam Lee" });
  });

  it("drops the update that only repeats an assignment", () => {
    const rows = [
      row({ id: 1, changed_fields: ["assignee_id", "updated_by"] }),
      row({ id: 2, event: "issue.assigned" }),
      row({ id: 3, changed_fields: ["assignee_id", "title"] }),
      row({ id: 4, subject_id: "issue-2", changed_fields: ["assignee_id"] }),
    ];
    expect(dropRepeatedAssignments(rows).map((r) => r.id)).toEqual([2, 3, 4]);
  });

  it("names a public feedback author as a submitter, not a teammate", () => {
    const summary = summarizeWakeEvent(row({
      subject_type: "feedback", subject_id: "post-1", event: "feedback.received", actor_id: "visitor-1",
    }), lookup());
    expect(summary.actor).toBe("a feedback submitter");
  });

  it("marks an object moved to the trash", () => {
    expect(summarizeWakeEvent(row({ after_state: { deleted: "2026-11-08T10:00:00Z" } }), lookup()).details)
      .toMatchObject({ deleted: "yes" });
  });

  it("reads a kind again without titles when its store refuses the read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const rows = await readKind("issues", ["issue-1"],
      () => Promise.reject(new Error("decode failed")),
      () => Promise.resolve({ data: [{ id: "issue-1" }], error: null }));
    expect(rows).toEqual([{ id: "issue-1" }]);
    await expect(readKind("issues", ["issue-1"],
      () => Promise.resolve({ data: null, error: { message: "boom" } }),
      () => Promise.resolve({ data: null, error: { message: "boom" } }))).rejects.toThrow();
  });
});
