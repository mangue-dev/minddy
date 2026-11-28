import type { IssueStatus } from "./issue-constants";
import { issueStatusForPrState, type SyncableIssueStatus } from "./pr-issue-status";
import type { PullRequestState } from "./pull-request-contract";

/**
 * What the code work linked to an issue implies for its status (MIN-1037).
 *
 * An issue can be followed by pull requests, by commits pushed without one,
 * or by both. Each signal used to be applied on its own, so two sources could
 * contradict each other: a closed pull request sent back to "to do" an issue
 * a direct commit had already delivered. The status is now resolved from ALL
 * the work linked to the issue, and the signal only decides how far the write
 * may go.
 *
 * Pure, and built on `issueStatusForPrState`: the pull request table has one
 * copy, which the link dialog also announces before the user confirms.
 */

/** A pull request linked to the issue. */
export interface LinkedPullRequestWork {
  state: PullRequestState;
  openedAt: string | null;
  mergedAt: string | null;
}

/** A commit that names the issue. */
export interface LinkedCommitWork {
  closes: boolean;
  onDefaultBranch: boolean;
  committedAt: string | null;
  /** When the commit was first seen on the default branch. This dates a
      delivery: the commit's own date says when it was written, which a
      cherry-pick keeps and which can precede the push by days. */
  deliveredAt: string | null;
  /** The commit belongs to a pull request: that pull request speaks for it. */
  inPullRequest: boolean;
}

export interface ForgeWork {
  pullRequests: readonly LinkedPullRequestWork[];
  commits: readonly LinkedCommitWork[];
  /** A branch named after the issue was pushed, and no pull request carries it. */
  branchPushed: boolean;
}

/** The forge event that asks for a status. */
export type ForgeWorkSignal =
  /** A pull request changed state. It is part of `work.pullRequests`. */
  | { kind: "pull_request"; state: PullRequestState; openedAt?: string | null }
  /** Commits naming the issue were pushed outside a pull request. */
  | { kind: "commits"; closesOnDefaultBranch: boolean }
  /** A branch named after the issue was pushed. */
  | { kind: "branch" };

const DONE = issueStatusForPrState("merged") as SyncableIssueStatus;
const IN_REVIEW = issueStatusForPrState("open") as SyncableIssueStatus;
const IN_PROGRESS = issueStatusForPrState("draft") as SyncableIssueStatus;
const TODO = issueStatusForPrState("closed") as SyncableIssueStatus;

function instant(value: string | null | undefined): number | null {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function standaloneCommits(work: ForgeWork): LinkedCommitWork[] {
  return work.commits.filter((commit) => !commit.inPullRequest);
}

/**
 * When the linked work delivered the issue: a merged pull request, or a
 * closing commit on the default branch. `"unknown"` when it did and no date
 * says when; null when nothing delivered it.
 */
function deliveredAt(work: ForgeWork): number | "unknown" | null {
  let latest: number | "unknown" | null = null;
  const note = (at: number | null) => {
    if (at == null) latest ??= "unknown";
    else if (latest == null || latest === "unknown" || at > latest) latest = at;
  };
  for (const pr of work.pullRequests) {
    if (pr.state === "merged") note(instant(pr.mergedAt));
  }
  for (const commit of work.commits) {
    if (commit.closes && commit.onDefaultBranch) {
      note(instant(commit.deliveredAt) ?? instant(commit.committedAt));
    }
  }
  return latest;
}

/**
 * The status the linked work describes, whatever the signal:
 *
 * | Linked work                                                         | Status      |
 * | ------------------------------------------------------------------- | ----------- |
 * | A merged pull request, or a closing commit on the default branch    | done        |
 * | Otherwise, an open pull request                                     | in review   |
 * | Otherwise, a draft, a commit naming the issue or a pushed branch    | in progress |
 * | Otherwise, only pull requests closed without a merge                | to do       |
 *
 * Null when no work is linked.
 */
export function forgeWorkStatus(work: ForgeWork): SyncableIssueStatus | null {
  if (deliveredAt(work) != null) return DONE;
  if (work.pullRequests.some((pr) => pr.state === "open")) return IN_REVIEW;
  if (
    work.pullRequests.some((pr) => pr.state === "draft") ||
    standaloneCommits(work).length > 0 ||
    work.branchPushed
  ) return IN_PROGRESS;
  return work.pullRequests.length > 0 ? TODO : null;
}

/** How far along a status is. A commit only ever moves an issue up this scale. */
const PROGRESS: Partial<Record<IssueStatus, number>> = {
  triage: 0,
  backlog: 0,
  todo: 0,
  in_progress: 1,
  in_review: 2,
  done: 3,
};

/**
 * The status to write for this signal, or null when nothing must be written.
 *
 * A pull request that changes state keeps its historical effect, including
 * the return to "to do" when it is closed without a merge. Only that return
 * consults the rest of the work: an issue delivered while the pull request
 * was alive stays done, and other live work keeps it in review or in progress.
 * A delivery older than the pull request does not count, since a later pull
 * request reopens the work.
 *
 * A commit or a branch only moves an issue forward: never over a status that
 * is further along, never out of canceled or duplicate, and never while a pull
 * request is live, which then speaks for the issue. A closing commit on the
 * default branch is the one commit signal that completes an issue.
 */
export function resolveForgeWorkStatus(opts: {
  current: IssueStatus;
  signal: ForgeWorkSignal;
  work: ForgeWork;
}): SyncableIssueStatus | null {
  const { current, signal, work } = opts;
  let target: SyncableIssueStatus | null;

  if (signal.kind === "pull_request") {
    target = issueStatusForPrState(signal.state);
    if (signal.state === "draft" && work.pullRequests.some((pr) => pr.state === "open")) {
      target = IN_REVIEW;
    }
    if (signal.state === "closed") {
      const delivered = deliveredAt(work);
      const opened = instant(signal.openedAt);
      const stillDelivered =
        delivered != null && (delivered === "unknown" || opened == null || delivered >= opened);
      target = stillDelivered
        ? DONE
        : (forgeWorkStatus({
            ...work,
            pullRequests: work.pullRequests.filter((pr) => pr.state !== "merged"),
            commits: standaloneCommits(work).map((commit) => ({ ...commit, closes: false })),
          }) ?? TODO);
    }
  } else {
    target =
      signal.kind === "commits" && signal.closesOnDefaultBranch ? DONE : IN_PROGRESS;
    const from = PROGRESS[current];
    if (from == null || (PROGRESS[target] ?? 0) <= from) return null;
    const livePullRequest = work.pullRequests.some(
      (pr) => pr.state === "open" || pr.state === "draft",
    );
    if (livePullRequest && target !== DONE) return null;
  }

  return target && target !== current ? target : null;
}
