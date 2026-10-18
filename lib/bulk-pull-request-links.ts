import type { IssuePr, PullRequestListItem } from "@/lib/agent-api";
import type { BulkPullRequestOption } from "@/lib/bulk-actions-context";

interface SelectedIssue {
  id: string;
  project_id: string;
}

const isLive = (pr: IssuePr | null): pr is IssuePr =>
  !!pr && (pr.state === "open" || pr.state === "draft");

/**
 * What a selection can do with pull requests.
 *
 * A pull request only takes issues of the project that links its repository
 * (the server's rule), so every target list is restricted to that project.
 * `partial` lists the live pull requests some selected issues already have,
 * when other selected issues of the same project do not have it yet.
 */
export function bulkPullRequestLinks(
  issues: readonly SelectedIssue[],
  prOf: (issueId: string) => IssuePr | null,
  openPullRequests: readonly PullRequestListItem[],
  linkedPullRequestIds: (issueId: string) => readonly string[] = (issueId) => {
    const pr = prOf(issueId);
    return pr ? [pr.prId] : [];
  },
) {
  const projects = new Set(issues.map((issue) => issue.project_id));
  const projectOfPr = new Map<string, string>();
  const options: BulkPullRequestOption[] = [];
  for (const pr of openPullRequests) {
    if (pr.pr_state !== "open" && pr.pr_state !== "draft") continue;
    if (!pr.project || !projects.has(pr.project.id)) continue;
    projectOfPr.set(pr.prId, pr.project.id);
    options.push({ prId: pr.prId, prNumber: pr.pr_number, state: pr.pr_state, title: pr.title ?? pr.head_branch ?? "" });
  }

  // Live PRs already on the selection; their project is the linked issue's.
  const live = new Map<string, BulkPullRequestOption & { projectId: string }>();
  for (const issue of issues) {
    const pr = prOf(issue.id);
    if (!isLive(pr) || live.has(pr.prId)) continue;
    const projectId = projectOfPr.get(pr.prId) ?? issue.project_id;
    projectOfPr.set(pr.prId, projectId);
    const title = options.find((option) => option.prId === pr.prId)?.title ?? "";
    live.set(pr.prId, { prId: pr.prId, prNumber: pr.prNumber, state: pr.state, title, projectId });
  }

  const targets = (prId: string): string[] => {
    const projectId = projectOfPr.get(prId);
    if (!projectId) return [];
    return issues
      .filter((issue) => issue.project_id === projectId && prOf(issue.id)?.prId !== prId)
      .map((issue) => issue.id);
  };

  // Every link of every selected issue, for "unlink from pull requests".
  const unlinkable = issues
    .map((issue) => ({ issueId: issue.id, prIds: linkedPullRequestIds(issue.id) }))
    .filter((link) => link.prIds.length > 0);
  // Picking a pull request for the whole selection is only offered while no
  // selected issue is linked to any pull request yet; `partial` covers the
  // mixed case, and "unlink" clears the slate first.
  const linkable = unlinkable.length === 0 ? options : [];

  const partial = [...live.values()]
    .map(({ projectId: _projectId, ...pr }) => ({ ...pr, missing: targets(pr.prId).length }))
    .filter((pr) => pr.missing > 0)
    .sort((left, right) => left.prNumber - right.prNumber);

  return { options: linkable, partial, targets, unlinkable };
}
