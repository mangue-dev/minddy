import "server-only";

import { randomUUID } from "node:crypto";

import { normalizeForgeInstant } from "@/lib/forge-time";
import type { ForgeWorkSignal } from "@/lib/forge-work-status";
import { COMMITS_PUSHED_EVENT, forgeActorValue } from "@/lib/pr-events";
import type { PullRequestCommit } from "@/lib/pull-request-contract";
import type { RepoProviderId } from "@/lib/repo-providers";
import { forgeFor, isForgeApiError } from "@/lib/server/agent/forge";
import { syncIssueStatusFromForgeWork } from "@/lib/server/agent/issue-status-sync";
import {
  issueRefFromPr,
  issueRefsFromCommit,
  parseIssueRef,
} from "@/lib/server/agent/pr-ingest-core";
import { decodePullRequestContentRow } from "@/lib/server/agent/pull-request-content";
import {
  pullRequestIssueIds,
  type PullRequestRow,
} from "@/lib/server/agent/pull-requests";
import { resolveLinkedRepository } from "@/lib/server/agent/repo-access";
import { removeForgeIssueEvents } from "@/lib/server/issue-event-store";
import { insertEvents } from "@/lib/server/issue-events";
import { issueStore } from "@/lib/server/issue-store";
import { getServiceClient } from "@/lib/supabase-service";
import {
  decodeCodeWorkRow,
  encodeCodeWorkRow,
  shouldEncryptCodeWorkContent,
} from "./commit-content";
import { alignGitlabWebhook } from "./gitlab-app";
import { commitTitle, type NormalizedPush, type PushCommit } from "./push-core";
import { repositoryStorageName } from "./repository-name-content";

/**
 * Commit tracking (MIN-1037): what a push means for the issues it names.
 *
 * Pull requests are one way to follow code work; people who push straight to
 * the default branch leave none. A push is therefore read on its own, with
 * the convention pull requests already use: a commit that names `MIN-42`
 * attaches the issue and starts it, `Fixes MIN-42` on the default branch
 * completes it, and a branch named `min-42-…` starts it and is shown on it.
 *
 * A commit belongs to at most one pull request. A push to the head branch of
 * a live pull request, and the commit a merge produced, are that pull
 * request's: they are stored attached to it, produce no activity of their own
 * and leave the status to it.
 *
 * Service key throughout: the callers are verified forge deliveries and the
 * repository sweep. Idempotent: a delivery, a redelivery and the sweep can
 * all bring the same commit, and only its first sighting counts.
 */

/** A normalized push, with the repository it reached. */
export interface RepoPush extends NormalizedPush {
  provider: RepoProviderId;
  /** `owner/name`, as the forge names it today. */
  repoFullName: string;
  /** The forge's stable repository id: the key of the stored rows. */
  externalRepoId: string;
}

interface LinkedProject {
  id: string;
  key: string;
  /** Member who linked the repository: the one who carries status writes. */
  linkedBy: string | null;
}

interface ResolvedIssue {
  id: string;
  projectId: string;
}

/** Projects that link this repository, trashed ones excluded. */
async function linkedProjects(
  provider: RepoProviderId,
  externalRepoId: string,
): Promise<LinkedProject[]> {
  const { data, error } = await getServiceClient()
    .from("project_git_links")
    .select("created_by, project:projects(id, key, deleted_at)")
    .eq("provider", provider)
    .eq("external_repo_id", externalRepoId);
  if (error) throw new Error("Unable to read repository links");
  // Embedded to-one relationship: an object at runtime.
  return ((data ?? []) as unknown as Array<{
    created_by: string | null;
    project: { id: string; key: string; deleted_at: string | null } | null;
  }>).flatMap((row) =>
    row.project && !row.project.deleted_at
      ? [{ id: row.project.id, key: row.project.key, linkedBy: row.created_by }]
      : []);
}

/** `"MIN-42"` → the issue, for every reference that names an existing one. */
async function resolveIssues(
  projects: LinkedProject[],
  refs: readonly string[],
): Promise<Map<string, ResolvedIssue>> {
  const numbersByProject = new Map<string, Map<number, string>>();
  for (const ref of new Set(refs)) {
    const parsed = parseIssueRef(ref);
    const project = parsed && projects.find((p) => p.key === parsed.key);
    if (!parsed || !project) continue;
    const numbers = numbersByProject.get(project.id) ?? new Map<number, string>();
    numbers.set(parsed.number, ref);
    numbersByProject.set(project.id, numbers);
  }
  const resolved = new Map<string, ResolvedIssue>();
  const service = getServiceClient();
  await Promise.all([...numbersByProject].map(async ([projectId, numbers]) => {
    // An issue in the trash counts as absent, as it does for a pull request.
    const { data, error } = await issueStore(service).select("id, number")
      .eq("project_id", projectId)
      .in("number", [...numbers.keys()])
      .is("deleted_at", null);
    if (error) throw new Error("Unable to resolve issues");
    for (const issue of (data ?? []) as Array<{ id: string; number: number }>) {
      const ref = numbers.get(issue.number);
      if (ref) resolved.set(ref, { id: issue.id, projectId });
    }
  }));
  return resolved;
}

function fromForgeCommit(commit: PullRequestCommit): PushCommit {
  return {
    sha: commit.sha,
    message: commit.message,
    authorLogin: commit.author?.login || null,
    authorAvatarUrl: commit.author?.avatar_url ?? null,
    authorName: commit.authorName,
    committedAt: commit.authoredAt,
  };
}

/**
 * Every commit of the push. A payload is cut past a size (20 commits on
 * GitLab): the rest is read from the forge, comparing the two ends of the
 * push. The accounts the payload resolved are kept, since the comparison of
 * one forge names authors by name only.
 */
async function allPushCommits(
  push: RepoPush,
  projects: LinkedProject[],
): Promise<PushCommit[]> {
  const base = push.before ?? push.defaultBranch;
  if (!push.truncated || !push.after || !base) return push.commits;
  try {
    for (const project of projects) {
      const target = await resolveLinkedRepository(project.id);
      if (!target || target.provider !== push.provider ||
          target.externalRepoId !== push.externalRepoId) continue;
      const { commits } = await forgeFor(push.provider).compareCommits({
        token: target.token,
        repoFullName: target.repoFullName,
        base,
        head: push.after,
      });
      const delivered = new Map(push.commits.map((commit) => [commit.sha, commit]));
      return commits.map((commit) => {
        const read = fromForgeCommit(commit);
        const known = delivered.get(read.sha);
        return known
          ? { ...read,
              authorLogin: read.authorLogin ?? known.authorLogin,
              authorAvatarUrl: read.authorAvatarUrl ?? known.authorAvatarUrl }
          : read;
      });
    }
  } catch {
    console.error("[commit-ingest] push_completion_failed");
  }
  return push.commits;
}

/** The live pull request whose head is this branch, the most recently updated one. */
async function livePullRequestOnBranch(
  provider: RepoProviderId,
  repoFullName: string,
  branch: string,
): Promise<string | null> {
  const service = getServiceClient();
  const { data, error } = await service.from("pull_requests")
    .select("id, head_branch, updated_at")
    .eq("provider", provider)
    .eq("repo_full_name", await repositoryStorageName(provider, repoFullName, false, service))
    .in("state", ["draft", "open"])
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Unable to read live pull requests");
  // Branch names are sealed per row: the match is made in memory.
  for (const row of (data ?? []) as Array<{ id: string; head_branch: string | null }>) {
    if ((await decodePullRequestContentRow(row)).head_branch === branch) return row.id;
  }
  return null;
}

/** sha → the pull request whose merge produced this commit. */
async function pullRequestsByMergeCommit(
  provider: RepoProviderId,
  repoFullName: string,
  shas: readonly string[],
): Promise<Map<string, string>> {
  const merged = new Map<string, string>();
  if (shas.length === 0) return merged;
  const service = getServiceClient();
  const { data, error } = await service.from("pull_requests")
    .select("id, merge_commit_shas")
    .eq("provider", provider)
    .eq("repo_full_name", await repositoryStorageName(provider, repoFullName, false, service))
    .overlaps("merge_commit_shas", [...shas]);
  if (error) throw new Error("Unable to read merged pull requests");
  for (const row of (data ?? []) as Array<{ id: string; merge_commit_shas: string[] | null }>) {
    for (const sha of row.merge_commit_shas ?? []) merged.set(sha, row.id);
  }
  return merged;
}

interface StoredCommit {
  issueId: string;
  sha: string;
  closes: boolean;
  committedAt: string | null;
  authorLogin: string | null;
  /** First sighting of this commit for this issue. */
  inserted: boolean;
  /** Already known from a branch, and now on the default branch. */
  promoted: boolean;
  pullRequestId: string | null;
}

async function storeCommit(opts: {
  push: RepoPush;
  commit: PushCommit;
  issueId: string;
  closes: boolean;
  pullRequestId: string | null;
  encrypt: boolean;
}): Promise<StoredCommit | null> {
  const { push, commit } = opts;
  const committedAt = normalizeForgeInstant(commit.committedAt)?.toISOString() ?? null;
  const row = await encodeCodeWorkRow("issue_commits", {
    id: randomUUID(),
    issue_id: opts.issueId,
    provider: push.provider,
    external_repo_id: push.externalRepoId,
    sha: commit.sha,
    title: commitTitle(commit.message) || null,
    author_name: commit.authorName,
    author_login: commit.authorLogin,
    author_avatar_url: commit.authorAvatarUrl,
    committed_at: committedAt,
    on_default_branch: push.onDefaultBranch,
    closes: opts.closes,
    pull_request_id: opts.pullRequestId,
  }, opts.encrypt);
  const { data, error } = await getServiceClient().rpc("upsert_issue_commit", { p_values: row });
  if (error) {
    console.error("[commit-ingest] commit_upsert_failed", error.code);
    return null;
  }
  const result = data as {
    inserted?: boolean; promoted?: boolean; pull_request_id?: string | null;
  } | null;
  return {
    issueId: opts.issueId,
    sha: commit.sha,
    closes: opts.closes,
    committedAt,
    authorLogin: commit.authorLogin,
    inserted: result?.inserted === true,
    promoted: result?.promoted === true,
    pullRequestId: result?.pull_request_id ?? null,
  };
}

/**
 * Records that a branch named after an issue was pushed. Returns whether the
 * branch moved: a redelivery of the same push changes nothing.
 */
async function recordBranch(push: RepoPush, issueId: string, branch: string): Promise<boolean> {
  const service = getServiceClient();
  const { data, error } = await service.from("issue_branches")
    .select("id, branch, head_sha")
    .eq("issue_id", issueId)
    .eq("provider", push.provider)
    .eq("external_repo_id", push.externalRepoId);
  if (error) throw new Error("Unable to read issue branches");
  const rows = await Promise.all(((data ?? []) as Array<{
    id: string; branch: string; head_sha: string | null;
  }>).map((row) => decodeCodeWorkRow("issue_branches", row)));
  const known = rows.find((row) => row.branch === branch);
  const pushedAt = new Date().toISOString();
  if (known) {
    if (known.head_sha === push.after) return false;
    const { error: updateError } = await service.from("issue_branches")
      .update({ head_sha: push.after, pushed_at: pushedAt }).eq("id", known.id);
    if (updateError) throw new Error("Unable to update issue branch");
    return true;
  }
  const row = await encodeCodeWorkRow("issue_branches", {
    id: randomUUID(),
    issue_id: issueId,
    provider: push.provider,
    external_repo_id: push.externalRepoId,
    branch,
    head_sha: push.after,
    pushed_at: pushedAt,
  }, await shouldEncryptCodeWorkContent());
  const { error: insertError } = await service.from("issue_branches").insert(row);
  if (insertError) throw new Error("Unable to record issue branch");
  return true;
}

/** Forgets a deleted branch. */
async function forgetBranch(push: RepoPush, issueId: string, branch: string): Promise<void> {
  const service = getServiceClient();
  const { data, error } = await service.from("issue_branches")
    .select("id, branch")
    .eq("issue_id", issueId)
    .eq("provider", push.provider)
    .eq("external_repo_id", push.externalRepoId);
  if (error) throw new Error("Unable to read issue branches");
  const rows = await Promise.all(((data ?? []) as Array<{ id: string; branch: string }>)
    .map((row) => decodeCodeWorkRow("issue_branches", row)));
  const ids = rows.filter((row) => row.branch === branch).map((row) => row.id);
  if (ids.length === 0) return;
  const { error: deleteError } = await service.from("issue_branches").delete().in("id", ids);
  if (deleteError) throw new Error("Unable to forget issue branch");
}

export interface PushIngestion {
  /** Commits stored or seen again, one per (commit, issue) pair. */
  commits: number;
  /** Issues whose status the push was allowed to move. */
  signaledIssueIds: string[];
}

const NOTHING: PushIngestion = { commits: 0, signaledIssueIds: [] };

/**
 * Applies a push to the issues it names: stores the commits and the branch,
 * records one activity line per issue, and asks the status resolver.
 */
export async function ingestPush(push: RepoPush): Promise<PushIngestion> {
  const branch = push.branch;
  // Tags and other refs carry no work of their own.
  if (!branch) return NOTHING;
  const projects = await linkedProjects(push.provider, push.externalRepoId);
  if (projects.length === 0) return NOTHING;
  const projectKeys = projects.map((project) => project.key);

  const branchRef = push.onDefaultBranch ? null : issueRefFromPr({ projectKeys, branch });
  if (push.deleted) {
    const issue = branchRef ? (await resolveIssues(projects, [branchRef])).get(branchRef) : null;
    if (issue) await forgetBranch(push, issue.id, branch);
    return NOTHING;
  }

  const commits = await allPushCommits(push, projects);
  const cited = commits.flatMap((commit) => {
    const refs = issueRefsFromCommit({ projectKeys, message: commit.message });
    return refs.length > 0 ? [{ commit, refs }] : [];
  });
  // Most pushes name no issue: nothing more is read for them.
  if (cited.length === 0 && !branchRef) return NOTHING;

  const issues = await resolveIssues(projects, [
    ...cited.flatMap(({ refs }) => refs.map(({ ref }) => ref)),
    ...(branchRef ? [branchRef] : []),
  ]);
  const branchIssue = branchRef ? issues.get(branchRef) ?? null : null;
  if (issues.size === 0) return NOTHING;

  // A commit belongs to at most one pull request: the live one on this
  // branch, or the one whose merge produced it on the default branch.
  const livePullRequestId = push.onDefaultBranch
    ? null
    : await livePullRequestOnBranch(push.provider, push.repoFullName, branch);
  const mergedBy = push.onDefaultBranch
    ? await pullRequestsByMergeCommit(
        push.provider, push.repoFullName, cited.map(({ commit }) => commit.sha))
    : new Map<string, string>();

  const encrypt = cited.length > 0 && (await shouldEncryptCodeWorkContent());
  const stored: StoredCommit[] = [];
  for (const { commit, refs } of cited) {
    for (const { ref, closes } of refs) {
      const issue = issues.get(ref);
      if (!issue) continue;
      const result = await storeCommit({
        push, commit, issueId: issue.id, closes, encrypt,
        pullRequestId: livePullRequestId ?? mergedBy.get(commit.sha) ?? null,
      });
      if (result) stored.push(result);
    }
  }

  // The branch is shown on its issue as long as no pull request carries it.
  let branchMoved = false;
  if (branchIssue && !livePullRequestId) {
    branchMoved = await recordBranch(push, branchIssue.id, branch);
  }

  const projectOf = new Map([...issues.values()].map((issue) => [issue.id, issue.projectId]));
  const signals = new Map<string, ForgeWorkSignal>();
  if (branchIssue && branchMoved) signals.set(branchIssue.id, { kind: "branch" });
  const events: Parameters<typeof insertEvents>[1] = [];
  for (const issueId of new Set(stored.map((commit) => commit.issueId))) {
    // Only work that no pull request carries speaks for itself, and only when
    // it is news: a commit seen again says nothing more.
    const standalone = stored.filter(
      (commit) => commit.issueId === issueId && !commit.pullRequestId);
    const news = standalone.filter((commit) => commit.inserted || commit.promoted);
    if (news.length > 0) {
      signals.set(issueId, {
        kind: "commits",
        closesOnDefaultBranch: push.onDefaultBranch && news.some((commit) => commit.closes),
      });
    }
    const fresh = standalone.filter((commit) => commit.inserted);
    if (fresh.length === 0) continue;
    const authors = new Set(fresh.map((commit) => commit.authorLogin).filter(Boolean));
    const login = push.pusher.login ?? (authors.size === 1 ? [...authors][0] : null);
    // The line is dated from its latest commit, which is also the key that
    // lets a merge take it back (`reconcilePullRequestCommits`).
    const at = fresh.map((commit) => commit.committedAt).filter(Boolean).sort().at(-1);
    events.push({
      issue_id: issueId,
      actor_id: null,
      type: COMMITS_PUSHED_EVENT,
      from_value: forgeActorValue(push.provider, login),
      to_value: String(fresh.length),
      ...(at ? { created_at: at } : {}),
    });
  }
  await insertEvents(getServiceClient(), events);

  for (const [issueId, signal] of signals) {
    const actorId = projects.find((p) => p.id === projectOf.get(issueId))?.linkedBy;
    if (!actorId) continue;
    await syncIssueStatusFromForgeWork({
      issueId, actorId, signal, forgeSync: push.provider,
    });
  }
  return { commits: stored.length, signaledIssueIds: [...signals.keys()] };
}

/**
 * Hands to a pull request the commits that turn out to be its own.
 *
 * Two cases. Commits pushed on a branch before its pull request existed were
 * stored on their own; once the pull request is there, it carries them. And a
 * push can reach minddy before the event that says the pull request was
 * merged: the commit the merge produced was then stored as a direct push, with
 * an activity line the merge already has. That line is taken back.
 *
 * Best effort: a failure leaves a commit listed twice, never a wrong status.
 */
export async function reconcilePullRequestCommits(
  pr: Pick<PullRequestRow, "id" | "provider" | "repo_full_name" | "state">,
  mergeCommitShas: readonly string[] = [],
): Promise<void> {
  try {
    const service = getServiceClient();
    const shas = [...new Set(mergeCommitShas.filter(Boolean))];
    if (pr.state === "merged" && shas.length > 0) {
      const { error } = await service.from("pull_requests")
        .update({ merge_commit_shas: shas }).eq("id", pr.id);
      if (error) throw new Error("Unable to record merge commits");
    }
    if (pr.state === "closed") return;

    const { data: links, error: linkError } = await service.from("project_git_links")
      .select("external_repo_id")
      .eq("provider", pr.provider)
      .eq("repo_full_name",
        await repositoryStorageName(pr.provider, pr.repo_full_name, false, service));
    if (linkError) throw new Error("Unable to read repository links");
    const repoIds = [...new Set(((links ?? []) as Array<{ external_repo_id: string }>)
      .map((link) => link.external_repo_id))];
    if (repoIds.length === 0) return;

    if (pr.state === "merged" && shas.length > 0) {
      const { data: adopted, error } = await service.from("issue_commits")
        .update({ pull_request_id: pr.id })
        .eq("provider", pr.provider)
        .in("external_repo_id", repoIds)
        .in("sha", shas)
        .is("pull_request_id", null)
        .select("issue_id, committed_at");
      if (error) throw new Error("Unable to attach merge commits");
      for (const row of (adopted ?? []) as Array<{ issue_id: string; committed_at: string | null }>) {
        if (!row.committed_at) continue;
        await removeForgeIssueEvents(service, {
          issueIds: [row.issue_id],
          type: COMMITS_PUSHED_EVENT,
          createdAt: row.committed_at,
        });
      }
    }

    const issueIds = await pullRequestIssueIds(pr.id);
    if (issueIds.length === 0) return;
    const { error } = await service.from("issue_commits")
      .update({ pull_request_id: pr.id })
      .eq("provider", pr.provider)
      .in("external_repo_id", repoIds)
      .in("issue_id", issueIds)
      .eq("on_default_branch", false)
      .is("pull_request_id", null);
    if (error) throw new Error("Unable to attach branch commits");
  } catch {
    console.error("[commit-ingest] pull_request_reconcile_failed");
  }
}

/**
 * Catch-up of the default branch (MIN-1037): reads the commits it gained
 * since the last sweep and applies them as one push. Webhooks are the normal
 * path; this repairs a lost delivery and serves setups without webhooks.
 *
 * The first sweep only notes where the branch stands: history from before
 * the repository was followed must not move issues.
 */
export async function syncDefaultBranchCommits(repo: {
  provider: RepoProviderId;
  repoFullName: string;
  externalRepoId: string;
  defaultBranch: string;
  token: string;
  connectionId: string;
}): Promise<void> {
  const service = getServiceClient();
  const storedName = await repositoryStorageName(repo.provider, repo.repoFullName, false, service);
  const { data, error } = await service.from("pull_request_syncs")
    .select("commits_synced_sha")
    .eq("provider", repo.provider)
    .eq("repo_full_name", storedName)
    .maybeSingle();
  // The cursor lives on the sweep row: without one, the next sweep starts it.
  if (error || !data) return;
  const cursor = (data as { commits_synced_sha: string | null }).commits_synced_sha;
  const forge = forgeFor(repo.provider);
  const saveCursor = async (sha: string | null) => {
    const { error: saveError } = await service.from("pull_request_syncs")
      .update({
        ...(sha ? { commits_synced_sha: sha } : {}),
        commits_synced_at: new Date().toISOString(),
      })
      .eq("provider", repo.provider)
      .eq("repo_full_name", storedName);
    if (saveError) console.error("[commit-ingest] cursor_save_failed", saveError.code);
  };
  const restart = async () => saveCursor(await forge.getBranchHeadSha({
    token: repo.token, repoFullName: repo.repoFullName, branch: repo.defaultBranch,
  }));

  if (!cursor) {
    // First sweep of this repository: a GitLab hook installed before commit
    // tracking does not send pushes yet.
    if (repo.provider === "gitlab") {
      await alignGitlabWebhook({
        externalRepoId: repo.externalRepoId, connectionId: repo.connectionId,
      });
    }
    return restart();
  }
  let commits: PullRequestCommit[];
  try {
    ({ commits } = await forge.compareCommits({
      token: repo.token,
      repoFullName: repo.repoFullName,
      base: cursor,
      head: repo.defaultBranch,
    }));
  } catch (cause) {
    // The cursor no longer exists (a rewritten branch): start again from its tip.
    if (isForgeApiError(cause) && cause.status === 404) return restart();
    throw cause;
  }
  const last = commits.at(-1);
  if (!last) return saveCursor(null);
  await ingestPush({
    provider: repo.provider,
    repoFullName: repo.repoFullName,
    externalRepoId: repo.externalRepoId,
    branch: repo.defaultBranch,
    before: cursor,
    after: last.sha,
    created: false,
    deleted: false,
    forced: false,
    defaultBranch: repo.defaultBranch,
    onDefaultBranch: true,
    commits: commits.map(fromForgeCommit),
    truncated: false,
    // Nobody was seen pushing: the line names the author when there is one.
    pusher: { accountId: null, login: null, avatarUrl: null },
  });
  await saveCursor(last.sha);
}
