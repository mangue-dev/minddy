import { describe, expect, it } from "vitest";
import {
  githubPrState,
  githubPrStateForAction,
  gitlabMrState,
  gitlabMrStateForAction,
  isPullRequestComment,
  isServiceAccountGesture,
  mrEventOccurredAt,
  prActionForMergeRequest,
  prActionForNote,
  prActionForPullRequest,
  prActionForReview,
  prEventOccurredAt,
} from "./pr-webhook-core";

/**
 * The two “forge event → minddy fact” tables: the PR STATE, and the issue's
 * activity line. The activity table fails SILENTLY: a misspelled action throws
 * nothing, it just never records anything, and nobody notices a missing line.
 * A wrong state is visible: it moves the issue.
 */

describe("githubPrState", () => {
  it("merged wins over closed: GitHub closes a PR when merging it", () => {
    expect(githubPrState({ state: "closed", merged: true })).toBe("merged");
    // The *list* endpoint does not return `merged`: `merged_at` is the only signal.
    expect(githubPrState({ state: "closed", merged_at: "2026-01-02T00:00:00Z" })).toBe("merged");
    expect(githubPrState({ state: "closed" })).toBe("closed");
  });

  it("a draft is a draft only while it is OPEN", () => {
    expect(githubPrState({ state: "open", draft: true })).toBe("draft");
    // GitHub keeps `draft: true` on a closed draft: reporting it as “draft”
    // would hide that it is dead.
    expect(githubPrState({ state: "closed", draft: true })).toBe("closed");
    expect(githubPrState({ state: "open" })).toBe("open");
  });
});

describe("githubPrStateForAction", () => {
  it("a REOPENED PR that is still a draft stays a draft", () => {
    // The MIN-164 bug: `reopened` was hard-coded to “open”, and the issue
    // moved to review for work nobody had submitted (MIN-138).
    expect(githubPrStateForAction("reopened", { state: "open", draft: true })).toBe("draft");
    expect(githubPrStateForAction("reopened", { state: "open" })).toBe("open");
  });

  it("drives the state from OPENING onward, like the GitLab receiver", () => {
    // Without `opened`, opening a human PR that cites an issue only had an
    // effect on GitLab, while merging had one on both forges.
    expect(githubPrStateForAction("opened", { state: "open" })).toBe("open");
    expect(githubPrStateForAction("opened", { state: "open", draft: true })).toBe("draft");
  });

  it("covers both directions of the draft toggle", () => {
    expect(githubPrStateForAction("converted_to_draft", { state: "open", draft: true })).toBe(
      "draft",
    );
    expect(githubPrStateForAction("ready_for_review", { state: "open" })).toBe("open");
  });

  it("leaves the state alone on EVERY other action", () => {
    // A push (`synchronize`) or a title edit (`edited`) updates the PR,
    // never its state.
    for (const action of ["synchronize", "edited", "labeled", "assigned"]) {
      expect(githubPrStateForAction(action, { state: "open" })).toBeNull();
    }
  });
});

describe("gitlabMrState", () => {
  it("reads BOTH names of the draft flag", () => {
    expect(gitlabMrState({ state: "opened", draft: true })).toBe("draft");
    // GitLab renamed `work_in_progress` to `draft` in 14.0: an older
    // self-hosted instance only sends the old one.
    expect(gitlabMrState({ state: "opened", work_in_progress: true })).toBe("draft");
    expect(gitlabMrState({ state: "opened" })).toBe("open");
  });

  it("`locked` is transient, not a fifth state", () => {
    expect(gitlabMrState({ state: "locked" })).toBe("open");
    expect(gitlabMrState({ state: "merged" })).toBe("merged");
    expect(gitlabMrState({ state: "closed" })).toBe("closed");
  });
});

describe("gitlabMrStateForAction", () => {
  it("an MR reopened as a draft stays a draft", () => {
    expect(
      gitlabMrStateForAction({ object_attributes: { action: "reopen", state: "opened", draft: true } }),
    ).toBe("draft");
  });

  it("rereads the state on `update` only when the title or draft flag changes", () => {
    // GitLab has no dedicated draft action: the draft lives in the title's
    // `Draft:` prefix. Without this guard, touching up a description would
    // rewrite the state (and, in cascade, the issue status) on every edit.
    const attrs = { action: "update", state: "opened", draft: true };
    expect(gitlabMrStateForAction({ object_attributes: attrs, changes: { title: {} } })).toBe(
      "draft",
    );
    expect(gitlabMrStateForAction({ object_attributes: attrs })).toBeNull();
  });

  it("an already closed MR does not flip back to draft on a rename", () => {
    expect(
      gitlabMrStateForAction({
        object_attributes: { action: "update", state: "closed", draft: true },
        changes: { title: {} },
      }),
    ).toBeNull();
  });
});

describe("prActionForPullRequest (GitHub)", () => {
  it("records opening and pushing", () => {
    expect(prActionForPullRequest("opened", false)).toBe("pr_opened");
    // `synchronize` IS GitHub's name for a push to the PR branch.
    expect(prActionForPullRequest("synchronize", false)).toBe("pr_committed");
  });

  it("tells a merge close apart from a plain close", () => {
    expect(prActionForPullRequest("closed", true)).toBe("pr_accepted");
    expect(prActionForPullRequest("closed", false)).toBe("pr_rejected");
  });

  it("records reopening, distinct from opening", () => {
    // MIN-164: this was the only lifecycle transition without a line. The
    // issue went back to review with nothing saying what had put it there.
    expect(prActionForPullRequest("reopened", false)).toBe("pr_reopened");
  });

  it("ignores forge noise", () => {
    // `converted_to_draft` / `ready_for_review` change the STATE (and so the
    // issue status, which records itself) but are not issue facts.
    for (const action of ["edited", "labeled", "assigned", "ready_for_review"]) {
      expect(prActionForPullRequest(action, false)).toBeNull();
    }
  });
});

describe("prActionForReview (GitHub)", () => {
  it("records verdicts", () => {
    expect(prActionForReview({ state: "approved" })).toBe("pr_approved");
    expect(prActionForReview({ state: "changes_requested" })).toBe("pr_changes_requested");
  });

  it("records a \"commented\" review only when it carries a message", () => {
    expect(prActionForReview({ state: "commented", body: "à revoir" })).toBe("pr_commented");
    // Without a body, the review is only the envelope of line comments, each
    // already recorded: recording it would add a line with no text.
    expect(prActionForReview({ state: "commented", body: "" })).toBeNull();
    expect(prActionForReview({ state: "commented", body: "   " })).toBeNull();
    expect(prActionForReview({ state: "commented" })).toBeNull();
  });

  it("ignores a dismissed review", () => {
    expect(prActionForReview({ state: "dismissed", body: "peu importe" })).toBeNull();
  });
});

describe("isPullRequestComment (GitHub)", () => {
  it("keeps only newly created PR comments", () => {
    expect(isPullRequestComment({ action: "created", issue: { pull_request: {} } })).toBe(true);
    // A forge issue is outside our scope (one-way sync).
    expect(isPullRequestComment({ action: "created", issue: {} })).toBe(false);
    expect(isPullRequestComment({ action: "edited", issue: { pull_request: {} } })).toBe(false);
    expect(isPullRequestComment({ action: "deleted", issue: { pull_request: {} } })).toBe(false);
  });
});

describe("prActionForMergeRequest (GitLab)", () => {
  it("records opening, reopening, merging, closing and approval", () => {
    expect(prActionForMergeRequest({ action: "open" })).toBe("pr_opened");
    expect(prActionForMergeRequest({ action: "reopen" })).toBe("pr_reopened");
    expect(prActionForMergeRequest({ action: "merge" })).toBe("pr_accepted");
    expect(prActionForMergeRequest({ action: "close" })).toBe("pr_rejected");
    expect(prActionForMergeRequest({ action: "approved" })).toBe("pr_approved");
    expect(prActionForMergeRequest({ action: "approval" })).toBe("pr_approved");
  });

  it("reads a push only from an `update` that carries `oldrev`", () => {
    // GitLab has no "push" action: a title, description or label change
    // arrives with the SAME action. Only `oldrev` says the head moved; without
    // this guard, editing a description would read as "committed".
    expect(prActionForMergeRequest({ action: "update", oldrev: "abc123" })).toBe("pr_committed");
    expect(prActionForMergeRequest({ action: "update" })).toBeNull();
  });

  it("ignores a withdrawn approval", () => {
    expect(prActionForMergeRequest({ action: "unapproved" })).toBeNull();
    expect(prActionForMergeRequest({ action: "unapproval" })).toBeNull();
  });
});

describe("prActionForNote (GitLab)", () => {
  it("tells a thread message from a line comment by its anchor", () => {
    expect(prActionForNote({ noteable_type: "MergeRequest" })).toBe("pr_commented");
    expect(
      prActionForNote({ noteable_type: "MergeRequest", position: { new_line: 12 } }),
    ).toBe("pr_code_commented");
  });

  it("ignores notes that are not on a merge request", () => {
    // A `Note Hook` covers everything that can be commented on in GitLab.
    for (const noteable of ["Issue", "Commit", "Snippet", undefined]) {
      expect(prActionForNote({ noteable_type: noteable })).toBeNull();
    }
  });
});

describe("isServiceAccountGesture (GitLab)", () => {
  it("covers the actions minddy takes under the linked account's token", () => {
    // Opening and pushing belong here since the agent records its own
    // actions: otherwise each Numo PR would carry two “opened” lines.
    for (const type of [
      "pr_accepted",
      "pr_rejected",
      "pr_opened",
      "pr_reopened",
      "pr_committed",
    ] as const) {
      expect(isServiceAccountGesture(type)).toBe(true);
    }
  });

  it("leaves COMMENTS out", () => {
    // Nobody comments under this token: an in-app comment goes out from the
    // person's own Git account. Listing comments here would silence, forever,
    // the comments of whoever linked the repository.
    expect(isServiceAccountGesture("pr_commented")).toBe(false);
    expect(isServiceAccountGesture("pr_code_commented")).toBe(false);
    expect(isServiceAccountGesture("pr_approved")).toBe(false);
  });
});

describe("prEventOccurredAt (GitHub)", () => {
  it("prefers the specific timestamp of each transition", () => {
    // An opening is dated by the creation of the PR, not by the delivery
    // of the hook: a repository linked hours later must not say "just now".
    expect(
      prEventOccurredAt("opened", {
        created_at: "2026-09-18T09:00:00Z",
        updated_at: "2026-09-18T12:00:00Z",
      }),
    ).toBe("2026-09-18T09:00:00Z");
    // A merge carries `merged_at`; a plain close falls back to `closed_at`.
    expect(
      prEventOccurredAt("closed", {
        merged: true,
        merged_at: "2026-09-18T10:00:00Z",
        closed_at: "2026-09-18T10:00:00Z",
        updated_at: "2026-09-18T10:00:01Z",
      }),
    ).toBe("2026-09-18T10:00:00Z");
    expect(
      prEventOccurredAt("closed", {
        merged: false,
        closed_at: "2026-09-18T10:00:00Z",
        updated_at: "2026-09-18T10:00:01Z",
      }),
    ).toBe("2026-09-18T10:00:00Z");
  });

  it("falls back to `updated_at` for actions the payload does not date", () => {
    // A push and a reopen carry no dedicated instant: `updated_at` is the
    // field the forge touches for both, so it still dates the action, not the capture.
    expect(prEventOccurredAt("synchronize", { updated_at: "2026-09-18T10:00:00Z" })).toBe(
      "2026-09-18T10:00:00Z",
    );
    expect(prEventOccurredAt("reopened", { updated_at: "2026-09-18T10:00:00Z" })).toBe(
      "2026-09-18T10:00:00Z",
    );
  });

  it("keeps the capture time (null) for untraced or unknown actions", () => {
    expect(prEventOccurredAt("edited", { updated_at: "2026-09-18T10:00:00Z" })).toBeNull();
    expect(prEventOccurredAt("labeled", undefined)).toBeNull();
  });
});

describe("mrEventOccurredAt (GitLab)", () => {
  it("prefers the specific timestamp of each transition", () => {
    expect(
      mrEventOccurredAt({
        action: "open",
        created_at: "2026-09-18T09:00:00Z",
        updated_at: "2026-09-18T12:00:00Z",
      }),
    ).toBe("2026-09-18T09:00:00Z");
    expect(
      mrEventOccurredAt({
        action: "merge",
        merged_at: "2026-09-18T10:00:00Z",
        updated_at: "2026-09-18T10:00:01Z",
      }),
    ).toBe("2026-09-18T10:00:00Z");
    expect(
      mrEventOccurredAt({
        action: "close",
        closed_at: "2026-09-18T10:00:00Z",
        updated_at: "2026-09-18T10:00:01Z",
      }),
    ).toBe("2026-09-18T10:00:00Z");
  });

  it("only dates the `update` that carries a push", () => {
    // A push is the traced `update`: `updated_at` moves with it. A title or
    // description retouch is not traced at all — null, capture time, no line.
    expect(mrEventOccurredAt({ action: "update", oldrev: "abc", updated_at: "2026-09-18T10:00:00Z" })).toBe(
      "2026-09-18T10:00:00Z",
    );
    expect(mrEventOccurredAt({ action: "update", updated_at: "2026-09-18T10:00:00Z" })).toBeNull();
  });

  it("keeps the capture time (null) for unknown actions", () => {
    expect(mrEventOccurredAt({ action: "approved", updated_at: "2026-09-18T10:00:00Z" })).toBeNull();
  });
});
