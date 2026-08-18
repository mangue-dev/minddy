// PURE selection of agent branches (MIN-102), without DB or server-only import:
// testable in node/vitest, like issue-sync-core.ts. The party who questions the
// base and forge lives in branch-cleanup.ts.
//
// The list shows ALL branches that minddy pushed that exist
// still on the repository — not just those whose PR is closed. One session
// of agent on hold, or who pushed without ever opening a PR, also has a
// branch, and we can't manage it without seeing it. What protects is therefore not
// no longer the absence of the line but its STATE: only the merged branches
// arrive checked, the rest require a gesture and a warning.
//
// Two membership locks, and you need both: the branch must be known
// from `agent_runs` (proof that minddy created it) AND have the agent prefix
// (defense in depth, in case a line of `agent_runs` points to a branch
// entered by hand).

import type { PullRequestRef } from "@/lib/server/agent/pr";

/** Prefix of branches pushed by the agent (see `execute.ts`, `workBranch`). */
export const AGENT_BRANCH_PREFIX = "minddy/agent/";

/**
 * State of an agent branch, in order of decreasing safety:
 * • `merged` — its PR is merged: the work is delivered, nothing to lose;
 * • `closed` — its PR has been refused: the work ONLY exists there ;
 * • `open` — its PR is open or in draft: a session is working ;
 * • `none` — no PR: freshly created branch, or session at rest.
 */
export type AgentBranchState = "merged" | "closed" | "open" | "none";

/** `open` and `none` = an agent session can still use it. */
export function isBranchInUse(state: AgentBranchState): boolean {
  return state === "open" || state === "none";
}

/** An agent branch of the repository, with the qualifying PR if there is one. */
export interface AgentBranch {
  branch: string;
  state: AgentBranchState;
  /** Null when `state` is `none`: there is no PR to reference. */
  prNumber: number | null;
  prUrl: string | null;
  /** Date of the PR retained (ISO), for sorting. Void without PR. */
  prCreatedAt: string | null;
}

/**
 * Deletion guardrail: is the branch an agent branch that can
 * be deleted without thinking? True only if it is prefixed, is not the default branch of the repository, and does not contain anything that would fall outside of the expected ref
 * (`..`, space) when interpolated into the API URL.
 */
export function isDeletableAgentBranch(branch: string, defaultBranch: string): boolean {
  if (!branch.startsWith(AGENT_BRANCH_PREFIX)) return false;
  if (branch.length === AGENT_BRANCH_PREFIX.length) return false;
  if (branch === defaultBranch) return false;
  if (branch.includes("..") || /\s/.test(branch)) return false;
  return true;
}

/** Is a PR still alive (open or draft)? */
function isLive(pr: PullRequestRef): boolean {
  return pr.state === "open" || pr.draft === true;
}

/** Freshness Comparator: The most recently opened PR wins. */
function newerThan(a: string | null, b: string | null): boolean {
  if (!a) return false;
  if (!b) return true;
  return a > b;
}

/** Display order: from safest to delete to riskiest. */
const STATE_ORDER: Record<AgentBranchState, number> = {
  merged: 0,
  closed: 1,
  open: 2,
  none: 3,
};

/**
 * Crosses three sources and makes agent branches manageable:
 * • `knownBranches` — what the project's runs have recorded (membership),
 * in the caller's iteration order (most recent run first), which
 * separates branches without PR, due to lack of date to compare ;
 * • `remoteBranches` — what REALLY exists on the repository. Without this filter, the
 * list would resurrect every branch ever created, the vast majority of which have already been deleted;
 * • `pulls` — which gives each branch its state.
 *
 * A living PR always trumps a Closed PR of the same branch (case
 * of a reopened PR): the branch is then `open`, never offered checked.
 */
export function selectAgentBranches(opts: {
  pulls: PullRequestRef[];
  knownBranches: Iterable<string>;
  remoteBranches: Set<string> | ReadonlySet<string>;
  defaultBranch: string;
}): AgentBranch[] {
  const { pulls, knownBranches, remoteBranches, defaultBranch } = opts;

  // Best live PR and best closed PR of each branch, in one pass.
  const live = new Map<string, PullRequestRef>();
  const dead = new Map<string, PullRequestRef>();
  for (const pr of pulls) {
    const branch = pr.head;
    if (!branch) continue;
    const bucket = isLive(pr) ? live : dead;
    const current = bucket.get(branch);
    if (!current || newerThan(pr.createdAt ?? null, current.createdAt ?? null)) {
      bucket.set(branch, pr);
    }
  }

  const seen = new Set<string>();
  const branches: AgentBranch[] = [];
  for (const branch of knownBranches) {
    if (seen.has(branch)) continue;
    seen.add(branch);
    if (!remoteBranches.has(branch)) continue;
    if (!isDeletableAgentBranch(branch, defaultBranch)) continue;

    const livePr = live.get(branch);
    const deadPr = livePr ? undefined : dead.get(branch);
    const pr = livePr ?? deadPr ?? null;
    const state: AgentBranchState = livePr
      ? "open"
      : deadPr
        ? deadPr.merged
          ? "merged"
          : "closed"
        : "none";

    branches.push({
      branch,
      state,
      prNumber: pr?.number ?? null,
      prUrl: pr?.url ?? null,
      prCreatedAt: pr?.createdAt ?? null,
    });
  }

  // Stable sorting: by state (the merged first, they will be pre-checked),
  // then by the most recent PR. Branches without PR keep the order received.
  return branches
    .map((b, index) => ({ b, index }))
    .sort((x, y) => {
      const byState = STATE_ORDER[x.b.state] - STATE_ORDER[y.b.state];
      if (byState !== 0) return byState;
      const byDate = (y.b.prCreatedAt ?? "").localeCompare(x.b.prCreatedAt ?? "");
      return byDate !== 0 ? byDate : x.index - y.index;
    })
    .map(({ b }) => b);
}
