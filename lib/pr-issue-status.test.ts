import { describe, expect, it } from "vitest";
import { issueStatusForPrState } from "./pr-issue-status";

// The PURE rule which aligns the status of a ticket with the state of its PR (MIN-46,
// corrected by MIN-138 for the draft). Writing in base (`applyIssueStatus`)
// is not testable in node (server-only) and remains in
// `lib/server/agent/issue-status-sync`, qui n'applique plus que cette table.

describe("issueStatusForPrState", () => {
  it("une PR ouverte met le ticket en revue", () => {
    expect(issueStatusForPrState("open")).toBe("in_review");
  });

  it("une PR BROUILLON laisse le ticket en cours — elle n'est pas à relire", () => {
    // This is the correction of MIN-138: the draft returned `in_review`, which
    // made work appear in the proofreading queue that no one had proposed.
    expect(issueStatusForPrState("draft")).toBe("in_progress");
  });

  it("une PR fusionnée termine le ticket", () => {
    expect(issueStatusForPrState("merged")).toBe("done");
  });

  it("une PR refusée renvoie le ticket à faire, jamais annulé", () => {
    expect(issueStatusForPrState("closed")).toBe("todo");
  });

  it("un état absent n'implique aucun statut", () => {
    expect(issueStatusForPrState(null)).toBeNull();
  });
});
