// PURE derivation (without DB, without server-only import): testable in node/vitest,
// comme prune.ts / caching.ts.

/**
 * Shared construction of the "agent activity by issue" response (MIN-46),
 * used by the project endpoint AND the global endpoint. Takes the runs of the agent
 * (sorted created_at DESC, excluding `failed`) and derives three views.
 *
 * The PR no longer comes from the runs. It came from there, and it made the
 * ticket say "I don't have a pull request" in two cases where it had one:
 * when no one had launched Numo on it (human PR attached by convention,
 * or attached by hand from the header — MIN-163), and when the PR was
 * CLOSED. Since MIN-143 the pull request is an entity: that's what we read.
 */

export interface AgentRunRow {
  issue_id: string;
  status: string;
  id: string;
  pr_number: number | null;
  pr_state: string | null;
  created_at: string;
}

/** Line `pull_requests` attached to a ticket, sorted `updated_at` DESC. */
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

/** The pull request for a ticket, as the client receives it. */
export interface IssuePrRef {
  /** Id minddy — the `?pr=` deep-link works regardless of the RA state. */
  prId: string;
  prNumber: number;
  state: "draft" | "open" | "merged" | "closed";
}

export interface AgentActivityResponse {
  /** The agent is WORKING (queued/running) → animated halo on the map. */
  workingIssueIds: string[];
  /**
 * An agent CONVERSATION exists on the outcome (at least one run not `failed`,
 * at work or at rest) → card entry OPENS the conversation instead of
 * starting a new one (conversational model: an at-rest session se
 * continues from its composer).
 */
  sessionIssueIds: string[];
  /**
 * PR of the ticket, ALL STATES COMBINED — the “View pull request” entry in the
 * menus must lead there even when closed. The chip of the card is only displayed
 * on an unclosed PR: it is the client who does this sorting, with `state`.
 */
  pullRequests: Record<string, IssuePrRef>;
}

const LIVE_STATES = new Set(["draft", "open"]);

function prState(raw: string): IssuePrRef["state"] {
  return raw === "draft" || raw === "merged" || raw === "closed" ? raw : "open";
}

/**
 * The PR of a ticket which carries several (successive runs: a refused PR,
 * then the one which replaces it). A LIVING PR always wins — it’s the one we
 * will reread; failing that, the most recently touched at the forge.
 */
export function pickIssuePullRequests(rows: IssuePrRow[]): Record<string, IssuePrRef> {
  const picked: Record<string, IssuePrRef> = {};
  const pickedLive = new Set<string>();
  // `rows` arrives sorted updated_at DESC: the first seen of a ticket is the most
  // fresh, and we only replace it with a living PR.
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
        .filter((r) => r.status === "queued" || r.status === "running")
        .map((r) => r.issue_id),
    ),
  ];
  // `rows` already excludes `failed` runs (contract of calling endpoints).
  const sessionIssueIds = [...new Set(rows.map((r) => r.issue_id))];
  return {
    workingIssueIds,
    sessionIssueIds,
    pullRequests: pickIssuePullRequests(prRows),
  };
}
