import { describe, expect, it, vi } from "vitest";

/** Smart Assign's objective lead (MIN-919): the member whose work is closest. */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: vi.fn() }));
vi.mock("@/lib/server/after-safe", () => ({ afterOrNow: vi.fn() }));
vi.mock("@/lib/server/entitlements", () => ({ canUseSmartAssign: vi.fn() }));
vi.mock("@/lib/server/embeddings", () => ({ requestEmbeddings: vi.fn() }));
vi.mock("@/lib/server/issue-store", () => ({ issueStore: vi.fn() }));
vi.mock("@/lib/server/issue-embedding-store", () => ({ listProjectEmbeddings: vi.fn() }));
vi.mock("@/lib/server/issue-events", () => ({ insertEvents: vi.fn() }));
vi.mock("@/lib/server/issue-relation-inference", () => ({
  embeddingText: vi.fn(),
  indexVersion: vi.fn(),
  lexicalScore: vi.fn(),
  MIN_LEXICAL_SCORE: 0.3,
  rankVectorNeighbours: vi.fn(),
}));

import { objectiveLeadEvent, pickLeadFromNeighbours } from "./smart-assign-objective";

const TEAM = ["owner", "ana", "ben"];

describe("pickLeadFromNeighbours", () => {
  it("picks the member whose assigned issues weigh most", () => {
    expect(
      pickLeadFromNeighbours(
        [
          { score: 0.9, assigneeId: "ana" },
          { score: 0.5, assigneeId: "ben" },
          { score: 0.6, assigneeId: "ben" },
          { score: 0.4, assigneeId: null },
        ],
        TEAM,
        "owner",
      ),
    ).toBe("ben");
  });

  it("ignores assignees who are not on the team, such as a reader or a former member", () => {
    expect(pickLeadFromNeighbours([{ score: 0.9, assigneeId: "gone" }], TEAM, "owner")).toBeNull();
    expect(pickLeadFromNeighbours([], TEAM, "owner")).toBeNull();
  });

  it("breaks a tie on the issue count, then on the owner, deterministically", () => {
    expect(
      pickLeadFromNeighbours(
        [{ score: 0.5, assigneeId: "ana" }, { score: 0.25, assigneeId: "ben" }, { score: 0.25, assigneeId: "ben" }],
        TEAM,
        "owner",
      ),
    ).toBe("ben");
    expect(
      pickLeadFromNeighbours([{ score: 0.5, assigneeId: "ben" }, { score: 0.5, assigneeId: "owner" }], TEAM, "owner"),
    ).toBe("owner");
    expect(
      pickLeadFromNeighbours([{ score: 0.5, assigneeId: "ben" }, { score: 0.5, assigneeId: "ana" }], TEAM, "owner"),
    ).toBe("ana");
  });
});

describe("objectiveLeadEvent", () => {
  it("is written without an actor and names Smart Assign", () => {
    expect(objectiveLeadEvent("objective-1", { leadId: "ana", fromWork: true })).toEqual({
      objective_id: "objective-1",
      actor_id: null,
      type: "updated",
      field: "lead_user_id",
      from_value: null,
      to_value: "ana",
      via_smart_assign: true,
      smart_assign_ai: true,
    });
  });
});
