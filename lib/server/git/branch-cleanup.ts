import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { issueIdentifier } from "@/lib/issue-constants";
import type { RepoProviderId } from "@/lib/repo-providers";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import { forgeFor } from "@/lib/server/agent/forge";
import { selectAgentBranches, type AgentBranch } from "./branch-cleanup-core";

/**
 * Agent branch management (MIN-102): list ALL branches that the project runs have pushed and which still live on the repository — merged PR,
 * refused, open, or no PR — then delete the ones designated.
 *
 * The client is NEVER believed: `deleteAgentBranches` recalculates the preview and
 * only accepts its intersection. Sending `main` in the POST therefore deletes
 * nothing, even with owner rights — the list served is the only authority.
 *
 * Client service: we read `agent_runs` from all the runs of the project (including
 * those of other members) and we mint a forge token; access control is
 * done by the calling route (project owner only).
 */

/** The ticket behind an agent branch (null for a notebook run, MIN-84). */
export interface BranchIssueRef {
  issueId: string;
  identifier: string;
  title: string;
}

/** A branch of the overview: the pure selection + the ticket that produced it. */
export interface AgentBranchInfo extends AgentBranch {
  issue: BranchIssueRef | null;
}

export interface AgentBranchesPreview {
  provider: RepoProviderId;
  repoFullName: string;
  branches: AgentBranchInfo[];
  /** One of the two paginated lists of the forge (PR, branches) has been cut:
 the preview is not exhaustive, and the UI says so. */
  truncated: boolean;
}

/** Result of deleting ONE branch — rendered as is in the UI. */
export interface BranchDeletionResult {
  branch: string;
  ok: boolean;
  /** The reference already no longer existed: success, not failure. */
  alreadyGone?: boolean;
  error?: string;
}

interface RunRow {
  branch_name: string | null;
  issue_id: string | null;
  issues: { id: string; number: number; title: string } | null;
}

/**
 * Branches recorded by the project agent runs → the ticket that produced them (null for a notebook run, which has no exit). This is the list of
 * branches that minddy allows herself to touch: everything that is not there belongs
 * to someone else.
 *
 * The order of insertion is that of the runs, from the most recent to the oldest: the
 * selection is used to arrange the branches WITHOUT PR, which do not have a PR date
 * to compare.
 */
export async function listAgentBranchesForProject(
  projectId: string,
): Promise<Map<string, BranchIssueRef | null>> {
  const supabase = getServiceClient();

  const [{ data: project }, { data: runs }] = await Promise.all([
    supabase.from("projects").select("key").eq("id", projectId).maybeSingle(),
    supabase
      .from("agent_runs")
      .select("branch_name, issue_id, issues(id, number, title)")
      .eq("project_id", projectId)
      .not("branch_name", "is", null)
      .order("created_at", { ascending: false }),
  ]);

  const projectKey = (project as { key?: string } | null)?.key ?? "";
  const map = new Map<string, BranchIssueRef | null>();
  for (const row of (runs ?? []) as unknown as RunRow[]) {
    const branch = row.branch_name;
    if (!branch || map.has(branch)) continue;
    const issue = row.issues;
    map.set(
      branch,
      issue
        ? {
            issueId: issue.id,
            identifier: issueIdentifier(projectKey, issue.number),
            title: issue.title,
          }
        : null,
    );
  }
  return map;
}

type CloneTarget = NonNullable<Awaited<ReturnType<typeof resolveRepoCloneTarget>>>;

/** Beyond that, `listBranches` took control of its own pagination ceiling
 (MAX_BRANCH_PAGES × 100): agent branches were able to fall by the wayside. */
const BRANCH_PAGE_LIMIT = 500;

/** Preview from an ALREADY resolved target — deletion reuses its own
 rather than mining a second token for the same household. */
async function previewFor(
  projectId: string,
  target: CloneTarget,
): Promise<AgentBranchesPreview> {
  const forge = forgeFor(target.provider);
  const [known, { pulls, truncated }, remote] = await Promise.all([
    listAgentBranchesForProject(projectId),
    forge.listPullRequests({
      token: target.token,
      repoFullName: target.repoFullName,
    }),
    // What REALLY exists on the repository side: without that, a branch since deleted
    // long time would reappear in the list as soon as it has no PR.
    forge.listBranches({
      token: target.token,
      repoFullName: target.repoFullName,
    }),
  ]);

  const branches = selectAgentBranches({
    pulls,
    knownBranches: known.keys(),
    remoteBranches: new Set(remote),
    defaultBranch: target.defaultBranch,
  }).map((b) => ({ ...b, issue: known.get(b.branch) ?? null }));

  return {
    provider: target.provider,
    repoFullName: target.repoFullName,
    branches,
    truncated: truncated || remote.length >= BRANCH_PAGE_LIMIT,
  };
}

/**
 * Preview the project's agent branches, or null if it has no repositories linked.
 * Throws forge errors (the route translates them to 502).
 */
export async function previewAgentBranches(
  projectId: string,
): Promise<AgentBranchesPreview | null> {
  const target = await resolveRepoCloneTarget(projectId);
  if (!target) return null;
  return previewFor(projectId, target);
}

/**
 * Deletes the requested branches, one by one and IN SEQUENCE (the forge API
 * does not like bursts, and a failure should not carry away the following ones).
 *
 * Recalculates the preview and accepts only its intersection: an absent branch from
 * the served list comes out as an explicit failure rather than being deleted on
 * word. Returns null if the project has no (or no more) linked repositories.
 */
export async function deleteAgentBranches(
  projectId: string,
  branches: string[],
): Promise<BranchDeletionResult[] | null> {
  const target = await resolveRepoCloneTarget(projectId);
  if (!target) return null;

  const preview = await previewFor(projectId, target);
  const forge = forgeFor(target.provider);
  const allowed = new Set(preview.branches.map((b) => b.branch));

  const results: BranchDeletionResult[] = [];
  for (const branch of branches) {
    if (!allowed.has(branch)) {
      results.push({ branch, ok: false, error: "Branch is not eligible for cleanup" });
      continue;
    }
    try {
      const outcome = await forge.deleteBranch({
        token: target.token,
        repoFullName: target.repoFullName,
        branch,
      });
      results.push({
        branch,
        ok: true,
        ...(outcome === "already-gone" ? { alreadyGone: true } : {}),
      });
    } catch (err) {
      results.push({ branch, ok: false, error: (err as Error).message });
    }
  }
  return results;
}
