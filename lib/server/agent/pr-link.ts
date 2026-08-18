import "server-only";

import type { SyncableIssueStatus } from "@/lib/pr-issue-status";
import { resolveRepoCloneTargetForRepo } from "./repo-access";
import { parsePullRequestRef } from "./pr-ingest-core";
import { broadcastPrChanged } from "./pr-live";
import { issueStatusForPrState, syncIssueStatusFromPr } from "./issue-status-sync";
import {
  findPullRequestByNumber,
  hasLivePullRequest,
  projectsForRepo,
  repoForProject,
  rowProvider,
  setPullRequestIssue,
  syncRepoPullRequests,
  type PullRequestRow,
} from "./pull-requests";

/**
 * HAND attach a pull request to a ticket — the RULE, once, for
 * the three surfaces that carry it (MIN-163): the app dialog (route
 * `pull-requests/[prId]`), the MCP (`minddy_link_pull_request`) and Numo
 * (`link_pull_request`).
 *
 * It lived in the HTTP handler, that is to say nowhere reusable: the
 * rewriting for each agent is giving yourself three versions of a refusal which must
 * be the same. What remains for the caller, and cannot go down, is
 * ACCESS: each surface has its own guard (RLS of the authenticated client for
 * the app, `requireProject` for the MCP, `assertIssueInProject` for Numo). The
 * heart therefore receives a ticket ALREADY authorized, and only judges the attachment.
 *
 * The meaning is UNIQUE, like `setPullRequestIssue`: we bind, we do not unbind. The
 * link is definitive on the product side, and a detachment would in any case be reestablished on the next scan if the branch still carries the reference.
 */

export type PrLinkRefusal =
  /** The PR ALREADY has another ticket — a link cannot be replaced. */
  | "pr_already_linked"
  /** The ticket already has a LIVING PR (draft or open). */
  | "issue_already_linked"
  /** The ticket project does not bind the filing of this PR. */
  | "issue_outside_repo";

export type PrLinkResult =
  | {
      ok: true;
      /** True when the PR ALREADY pointed to this ticket: nothing was written. */
      already: boolean;
      /**
 * Status where the attachment has issued the ticket. `null` stays in type
 * (`issueStatusForPrState` makes it in an unknown state) but not in
 * facts: the four states in a `pull_requests` line all imply a
 * status.
 */
      status: SyncableIssueStatus | null;
    }
  | { ok: false; code: PrLinkRefusal };

/**
 * Sets the link, or says why it is not set.
 *
 * The already-linked splits into TWO cases, because they don't mean the same
 * thing: the same PR on the same ticket, it's the gesture already made (`already`) —
 * an agent who replays his call must find a success, not an error; the
 * same PR on ANOTHER ticket, it's a real conflict.
 */
export async function linkPullRequestToIssue(opts: {
  pr: PullRequestRow;
  /** Ticket already authorized by the caller (existing, visible, not in the trash). */
  issue: { id: string; projectId: string };
  actorId: string;
}): Promise<PrLinkResult> {
  const { pr, issue, actorId } = opts;
  const status = issueStatusForPrState(pr.state);

  if (pr.issue_id === issue.id) return { ok: true, already: true, status };
  if (pr.issue_id) return { ok: false, code: "pr_already_linked" };

  // The exact perimeter of the conventional route (`resolveIssueForPr`): a
  // ticket only attaches to a PR of a repository that its project links.
  const projects = await projectsForRepo(rowProvider(pr), pr.repo_full_name);
  if (!projects.some((p) => p.id === issue.projectId)) {
    return { ok: false, code: "issue_outside_repo" };
  }

  if (await hasLivePullRequest(issue.id)) {
    return { ok: false, code: "issue_already_linked" };
  }

  // This is the BASE that decides: `false` = the PR has been attached in the meantime.
  if (!(await setPullRequestIssue(pr.id, issue.id))) {
    return { ok: false, code: "pr_already_linked" };
  }

  // The list and the ticket panel pass through the broadcast trigger
  // (`issue_id` is one of the columns that broadcast); the OPEN sign on the
  // PR shows the ticket in a header served by the forge.
  broadcastPrChanged(pr.id, ["pr"]);
  await syncIssueStatusFromPr({ issueId: issue.id, actorId, prState: pr.state });

  return { ok: true, already: false, status };
}

export type PrResolveFailure =
  /** The reference given is not a pull request number/url. */
  | "invalid_ref"
  /** The project has no linked repository — there are no PRs to designate. */
  | "no_repository"
  /** The repository is linked, but it does not have a PR with this number. */
  | "not_found";

/**
 * The pull request that a user DESIGNATES in a project: "#42", or
 * the URL he copied. This is the entry for agents, who do not have a minddy de
 * PR ID on hand — the app always leaves it.
 *
 * CATCH-UP counts here more than elsewhere. `pull_requests` is populated by
 * webhooks and by periodic scanning: a PR opened thirty seconds ago
 * on a repository without a deployed webhook is simply not there yet, and responding
 * "not found" on a PR that the user has in front of them would pass
 * the tool for broken. We therefore scan the deposit ONE time on a shortage, then we
 * read again. The scan remains best-effort: forge down = “not found”, not
 * an error that comes up.
 */
export async function resolveProjectPullRequest(opts: {
  projectId: string;
  /** Number, `#42`, `!42` (MR GitLab), or forge URL. */
  ref: string | number | null | undefined;
  /** User on whose behalf the catchup reads the forge. */
  userId: string;
}): Promise<{ pr: PullRequestRow } | { error: PrResolveFailure }> {
  const number = parsePullRequestRef(opts.ref);
  if (number == null) return { error: "invalid_ref" };

  const repo = await repoForProject(opts.projectId);
  if (!repo) return { error: "no_repository" };

  const existing = await findPullRequestByNumber({ ...repo, number });
  if (existing) return { pr: existing };

  try {
    const target = await resolveRepoCloneTargetForRepo({
      userId: opts.userId,
      provider: repo.provider,
      repoFullName: repo.repoFullName,
    });
    if (target) {
      await syncRepoPullRequests({ ...repo, token: target.token });
    }
  } catch (err) {
    console.error("[pr-link] sweep failed:", (err as Error).message);
  }

  const swept = await findPullRequestByNumber({ ...repo, number });
  return swept ? { pr: swept } : { error: "not_found" };
}
