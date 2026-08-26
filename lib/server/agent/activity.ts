// Pure derivation without database or server-only imports, testable in Node/Vitest.

/**
 * Builds the shared agent-activity response used by project and global endpoints.
 *
 * Pull requests come from their own rows so human-attached and closed PRs are
 * represented even when no agent run references them.
 */

export interface AgentRunRow {
  issue_id: string | null;
  status: string;
  id: string;
  pr_number: number | null;
  pr_state: string | null;
  created_at: string;
}

/** A pull request attached to an issue, sorted by `updated_at` descending. */
export interface IssuePrRow {
  id: string;
  issue_id: string | null;
  number: number;
  state: string;
  updated_at: string;
}

export interface ScopedIssuePrRow extends IssuePrRow {
  provider: string;
  repo_full_name: string;
  issue: { project_id: string } | { project_id: string }[] | null;
}

export interface ProjectRepoBindingRow {
  project_id: string;
  provider: string;
  repo_full_name: string | null;
}

/**
 * A repository-level PR is visible only when its attached issue belongs to the
 * same project↔repository pair that authorizes the poll. Repository-only RLS is
 * insufficient when two projects link the same forge repository.
 */
export function issuePullRequestsForBindings(
  rows: ScopedIssuePrRow[],
  bindings: ProjectRepoBindingRow[],
): IssuePrRow[] {
  const allowed = new Set(
    bindings.flatMap((binding) =>
      binding.repo_full_name
        ? [`${binding.project_id}\0${binding.provider}\0${binding.repo_full_name}`]
        : [],
    ),
  );
  return rows.filter((row) => {
    const issue = Array.isArray(row.issue) ? row.issue[0] : row.issue;
    return Boolean(
      issue?.project_id &&
      allowed.has(`${issue.project_id}\0${row.provider}\0${row.repo_full_name}`),
    );
  });
}

/** The pull request reference returned to the client. */
export interface IssuePrRef {
  /** Minddy ID used by the `?pr=` deep link regardless of PR state. */
  prId: string;
  prNumber: number;
  state: "draft" | "open" | "merged" | "closed";
}

export interface AgentActivityResponse {
  /** Issues with a queued or running agent. */
  workingIssueIds: string[];
  /**
   * Issues with an agent conversation, whether active or at rest.
 */
  sessionIssueIds: string[];
  /**
   * Pull requests in every state; clients decide which states receive a chip.
 */
  pullRequests: Record<string, IssuePrRef>;
}

const LIVE_STATES = new Set(["draft", "open"]);

function prState(raw: string): IssuePrRef["state"] {
  return raw === "draft" || raw === "merged" || raw === "closed" ? raw : "open";
}

/**
 * Selects a live PR over terminal PRs, then keeps the most recently updated row.
 */
export function pickIssuePullRequests(rows: IssuePrRow[]): Record<string, IssuePrRef> {
  const picked: Record<string, IssuePrRef> = {};
  const pickedLive = new Set<string>();
  // Rows are sorted by updated_at descending; only a live PR can replace the first row.
  for (const row of rows) {
    if (!row.issue_id) continue;
    const live = LIVE_STATES.has(row.state);
    if (picked[row.issue_id] && (pickedLive.has(row.issue_id) || !live)) continue;
    picked[row.issue_id] = {
      prId: row.id,
      prNumber: row.number,
      state: prState(row.state),
    };
    if (live) pickedLive.add(row.issue_id);
  }
  return picked;
}

export function buildAgentActivity(
  rows: AgentRunRow[],
  prRows: IssuePrRow[] = [],
): AgentActivityResponse {
  const workingIssueIds = [
    ...new Set(
      rows
        .filter(
          (r): r is AgentRunRow & { issue_id: string } =>
            Boolean(r.issue_id) && (r.status === "queued" || r.status === "running"),
        )
        .map((r) => r.issue_id),
    ),
  ];
  // `rows` already excludes `failed` runs (contract of calling endpoints).
  const sessionIssueIds = [
    ...new Set(rows.flatMap((r) => (r.issue_id ? [r.issue_id] : []))),
  ];
  return {
    workingIssueIds,
    sessionIssueIds,
    pullRequests: pickIssuePullRequests(prRows),
  };
}
