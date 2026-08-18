import type { IssueStatus } from "./issue-constants";

/**
 * The table that says what a pull request status implies for its ticket
 * (MIN-46). Pure and without server dependency: synchronization applies it
 * (`lib/server/agent/issue-status-sync`), and the dialog which links a ticket to a
 * PR by hand (MIN-163) ANNOUNCES it before making the gesture — the consequence is
 * said before, not after, since the link is not canceled not.
 *
 * Only one copy of the rule: duplicating it on the client side would let it diverge
 * silently, and the user would then read a promise that the server does not keep.
 */

/** The only statuses that a pull request moves. */
export type SyncableIssueStatus = Extract<
  IssueStatus,
  "in_progress" | "in_review" | "done" | "todo"
>;

/** pr_state → issue status to apply, or null if the state implies nothing. */
export function issueStatusForPrState(
  prState: "draft" | "open" | "merged" | "closed" | null | undefined,
): SyncableIssueStatus | null {
  switch (prState) {
    case "open":
      return "in_review";
    case "draft":
      // A draft PR is NOT ready to be proofread: its author is working on it
      // Again. Pushing it to review would make it appear in the replay queue
      // a job that no one offered (MIN-138).
      return "in_progress";
    case "merged":
      return "done";
    case "closed":
      // PR refused → the outcome returns “to do” (never canceled): the work
      // remains to be resumed, unlike an explicit abandonment (MIN-46).
      return "todo";
    default:
      return null;
  }
}
