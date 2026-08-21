import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { createIssueForProject } from "@/lib/server/create-issue";
import { updateIssueFields } from "@/lib/server/update-issue";
import { importIssuesIntoProject } from "@/lib/server/import-issues";
import { ensureIssueLimit } from "@/lib/server/entitlements";
import { isPlanLimitError } from "@/lib/server/plan-limit-error";
import { setIssueCategories } from "@/lib/server/set-issue-categories";
import {
  addIssueRelation,
  findIssueRelation,
  removeIssueRelation,
} from "@/lib/server/issue-relations";
import { categoryKey, resolveCategoryIdsByName } from "@/lib/server/categories";
import { readForgeLabels } from "@/lib/import/forge-labels";
import type { ImportedIssue } from "@/lib/import/types";
import type { IssueStatusValue } from "@/lib/issue-validation";
import type { RepoProviderId } from "@/lib/repo-providers";
import {
  listGithubIssueComments,
  listRepoOpenIssues,
  type RemoteGithubIssueComment,
} from "./github-app";
import { getGitlabAccessToken, listGitlabOpenIssues } from "./gitlab-app";
import {
  buildForgeAssigneeIndex,
  matchForgeAssignee,
  type ForgeAssigneeIndex,
} from "./forge-members";
import { forgeIssueResource } from "./forge-resource";
import {
  REMOTE_LANDING_STATUS,
  statusForRemoteReconcile,
  type GithubIssueComment,
  type GithubIssueDependency,
  type RemoteIssue,
} from "./issue-sync-core";

/**
 * Heart of the DESCENDING direction of the issue sync (linked repository → minddy, MIN-97).
 * Called by the two webhook receivers and by the backfill launched upon activation
 * of the toggle.
 *
 * Nothing HERE is not written to the provider: the only return that exists is that of
 * the open/closed state, and it lives separately, in `issue-push.ts`, called since
 * `updateIssueFields`. Creating a ticket in minddy still does not create any issue
 * GitHub/GitLab.
 *
 * Deduplication is not done in TS but by the partial UNIQUE index
 * `idx_issues_remote_identity`: a reissue of webhook produced a
 * violation 23505 that `createIssueForProject` returns as 409 — swallowed here.
 *
 * Write actor: `project_git_links.created_by`, the owner who bound the
 * repository (updateIssueFields requires a project member). The events are
 * stamped `forge_sync` — which credits GitHub/GitLab in the timeline
 * rather than this person (same compromise as the code agent) AND, since the
 * status return, prevents the loop: a stamped write forges ne
 * do not go back to the forge.
 */

/** Hard backfill ceiling: beyond that, we do not import the history of a deposit. */
export const REMOTE_BACKFILL_MAX = 500;

/** A link whose outcome synchronization is active. */
export interface IssueSyncTarget {
  linkId: string;
  projectId: string;
  provider: RepoProviderId;
  connectionId: string;
  installationId: number | null;
  externalRepoId: string;
  repoFullName: string | null;
  /** "relay" when the connection was established through the managed forge
   * relay — decides whether GitLab hook provisioning points at Cloud. */
  connectionSource?: string | null;
  /** The owner who linked the repository — technical actor of the entries. */
  createdBy: string | null;
}

const TARGET_COLUMNS =
  "id, project_id, provider, connection_id, installation_id, external_repo_id, repo_full_name, created_by, git_connections(source)";

type TargetRow = {
  id: string;
  project_id: string;
  provider: string;
  connection_id: string;
  installation_id: number | null;
  external_repo_id: string;
  repo_full_name: string | null;
  created_by: string | null;
  git_connections?: { source: string | null } | { source: string | null }[] | null;
};

const toTarget = (row: TargetRow): IssueSyncTarget => ({
  linkId: row.id,
  projectId: row.project_id,
  provider: row.provider as RepoProviderId,
  connectionId: row.connection_id,
  installationId: row.installation_id,
  externalRepoId: row.external_repo_id,
  repoFullName: row.repo_full_name,
  // Embedded to-one relationship: object at runtime, cast via unknown.
  connectionSource: Array.isArray(row.git_connections)
    ? row.git_connections[0]?.source ?? null
    : row.git_connections?.source ?? null,
  createdBy: row.created_by,
});

/**
 * The ACTIVE bindings of a repository. Several projects can link the same repository
 * (via different connections): the fan-out must serve them all, like
 * `syncPrState` does for PRs.
 *
 * On the NUMERICAL ID of the repository, not on its name (MIN-333). A name of
 * deposit is released at the forge as soon as it is renamed, and is reallocated to whomever the
 * requests: routing on it means accepting that the buyer of a name inherits the
 * tickets of its former bearer. The id is never reassigned — and it is
 * already stored (`external_repo_id`) as it is already carried by the payload.
 */
export async function listIssueSyncTargets(params: {
  provider: RepoProviderId;
  repoId: string;
}): Promise<IssueSyncTarget[]> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("project_git_links")
    .select(TARGET_COLUMNS)
    .eq("provider", params.provider)
    .eq("external_repo_id", params.repoId)
    .eq("issue_sync_enabled", true);
  if (error) {
    console.error("[issue-sync] targets lookup failed:", error.message);
    return [];
  }
  return ((data ?? []) as TargetRow[]).map(toTarget);
}

/** The link of a project, whether active or not (backfill, activation). */
export async function getIssueSyncLink(
  projectId: string,
): Promise<IssueSyncTarget | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("project_git_links")
    .select(TARGET_COLUMNS)
    .eq("project_id", projectId)
    .maybeSingle();
  return data ? toTarget(data as TargetRow) : null;
}

/** Writes the binding toggle (and the id of the provisioned GitLab hook). */
export async function setIssueSyncEnabled(params: {
  linkId: string;
  enabled: boolean;
  hookId?: string | null;
}): Promise<void> {
  const service = getServiceClient();
  const patch: Record<string, unknown> = {
    issue_sync_enabled: params.enabled,
    issue_sync_enabled_at: params.enabled ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  if (params.hookId !== undefined) patch.issue_sync_hook_id = params.hookId;
  const { error } = await service
    .from("project_git_links")
    .update(patch)
    .eq("id", params.linkId);
  if (error) throw new Error(error.message);
}

/**
 * Applies a remote issue event to ONE binding: creates the ticket if it
 * does not yet exist, otherwise RECONCILIATES the existing ticket with the remote issue
 *. Best-effort — a failing target should not prevent others
 * from being served.
 *
 * Reconciliation is an assumed reversal from MIN-97, which
 * only aligned the status "so as not to overwrite the work done in minddy."
 * Usage has decided otherwise: when a team still opens issues on the
 * repository while the minddy project exists, it means that the repository remains the place where
 * this issue lives. The ticket is the REFLECTION, and a reflection that diverges from what it reflects is no longer useful. What has no remote equivalent — the
 * plan, the minddy comments, the goal, the cycle — is never touched.
 */
export async function applyRemoteIssue(
  target: IssueSyncTarget,
  remote: RemoteIssue,
  /** Login index → ​​member, built once per BATCH when there is one
 * (backfill). Absent = constructed here, for an isolated event. */
  assignees?: ForgeAssigneeIndex,
): Promise<void> {
  if (!target.createdBy) {
    console.warn(
      `[issue-sync] link ${target.linkId} has no created_by — skipped`,
    );
    return;
  }
  const service = getServiceClient();
  const { data: existing, error } = await service
    .from("issues")
    .select("id, status, title, description, assignee_id, priority, effort, due_date, updated_at")
    .is("deleted_at", null)
    .eq("project_id", target.projectId)
    .eq("remote_provider", remote.provider)
    .eq("remote_repo_id", remote.repoId)
    .eq("remote_number", remote.number)
    .maybeSingle();
  if (error) {
    console.error("[issue-sync] lookup failed:", error.message);
    return;
  }

  const { priority, effort, labels } = readForgeLabels(remote.labels);
  // The index costs two queries: we only build it if the outcome names
  // actually someone. Most webhooks (`labeled`, `edited`) do not
  // don't talk about assignment, and many repositories never assign anything.
  const index =
    remote.assigneeLogins.length === 0
      ? null
      : (assignees ??
        (await buildForgeAssigneeIndex({
          projectId: target.projectId,
          provider: target.provider,
        })));
  const assigneeId = index ? matchForgeAssignee(remote.assigneeLogins, index) : null;

  if (!existing) {
    // Never imported: it ALWAYS enters through sorting, whatever the state
    // remote. A closure can fall here (issue beyond the ceiling of
    // backfill) — creating it directly in `done` would make it enter the project
    // without anyone ever seeing it.
    const resource = forgeIssueResource({
      provider: remote.provider,
      repoFullName: remote.repoFullName,
      number: remote.number,
      url: remote.url,
    });
    const result = await createIssueForProject({
      projectId: target.projectId,
      actorId: target.createdBy,
      input: {
        title: remote.title || `#${remote.number}`,
        description: remote.body ?? undefined,
        status: REMOTE_LANDING_STATUS,
        priority,
        effort,
        assignee_id: assigneeId,
        ...(remote.dueDate !== undefined ? { due_date: remote.dueDate } : {}),
        resources: resource ? [resource] : undefined,
      },
      remote: {
        provider: remote.provider,
        repoId: remote.repoId,
        number: remote.number,
        url: remote.url,
      },
    });
    if (!result.ok) {
      // 409 = reissue of the webhook, the normal path: silence.
      if (result.errorKey !== "remoteIssueAlreadyImported") {
        console.error(
          `[issue-sync] create failed for ${remote.repoFullName}#${remote.number}:`,
          result.errorKey ?? result.rawMessage,
        );
      }
      return;
    }
    await syncGithubMetadata(result.issue.id as string, remote);
    await applyRemoteLabels(target, result.issue.id as string, labels);
    return;
  }

  // ── Already imported: we realign what the forge carries, and nothing else ──
  //
  // ONE rule governs this entire block: **the forge only crushes a field if it
  // has something to say about it.** She always has a title, a body and a state,
  // so these three follow unconditionally. She does not necessarily have
  // priority, size, assignment or labels — and take his silence for
  // a value would be devastating: on a repository which never assigns its outcomes,
  // the slightest webhook `labeled` would unassign the ticket that someone came
  // to take in minddy, without anything asking for it.
  const issueId = existing.id as string;
  const patch: Record<string, unknown> = {};
  const githubSyncState = await readGithubIssueSyncState(issueId, remote);
  const remoteIsStale = isStaleRemoteUpdate({
    remoteUpdatedAt: remote.updatedAt,
    localUpdatedAt: existing.updated_at,
    previousRemoteUpdatedAt: githubSyncState?.updated_at_remote,
    previousSyncedAt: githubSyncState?.synced_at,
  });

  if (!remoteIsStale) {
    const title = remote.title || `#${remote.number}`;
    if (title !== existing.title) patch.title = title;
    const body = remote.body ?? null;
    if (body !== (existing.description ?? null)) patch.description = body;
  // The assignee follows when the forge NAMES someone we recognize. An assigned
  // that we do not recognize (account not connected) does not empty the box either:
  // we don't know who it is, so we don't know anything more than before.
    if (assigneeId && assigneeId !== (existing.assignee_id ?? null)) {
      patch.assignee_id = assigneeId;
    }
    if (priority !== "none" && priority !== existing.priority) patch.priority = priority;
    if (effort && effort !== existing.effort) patch.effort = effort;
    if (remote.dueDate !== undefined && remote.dueDate !== (existing.due_date ?? null)) {
      patch.due_date = remote.dueDate;
    }

  // The status follows the remote STATUS, compared to the state as the current status
  // represents — not the status itself: `canceled` and `done` are both
  // “closed”, and a closed exit that remains closed should not reclassify anything.
    const mappedStatus = statusForRemoteReconcile(
      remote,
      existing.status as IssueStatusValue,
    );
    if (mappedStatus) patch.status = mappedStatus;
  }

  if (Object.keys(patch).length > 0) {
    const updated = await updateIssueFields({
      issueId,
      actorId: target.createdBy,
      input: patch,
      // It is this flag which prevents the LOOP: `updateIssueFields` does not
      // do not push back to the forge a status that comes from it (see issue-push.ts).
      forgeSync: remote.provider,
    });
    if (!updated.ok) {
      console.error(
        `[issue-sync] update failed for ${remote.repoFullName}#${remote.number}:`,
        updated.errorKey ?? updated.rawMessage,
      );
    }
  }

  await syncGithubMetadata(issueId, remote);
  if (!remoteIsStale) await applyRemoteLabels(target, issueId, labels);
}

/** Returns true only when a fully timestamped GitHub payload predates a local change. */
function isOlderThanLocal(remoteUpdatedAt: string | null | undefined, localUpdatedAt: unknown): boolean {
  if (typeof remoteUpdatedAt !== "string" || typeof localUpdatedAt !== "string") return false;
  const remote = Date.parse(remoteUpdatedAt);
  const local = Date.parse(localUpdatedAt);
  return !Number.isNaN(remote) && !Number.isNaN(local) && remote < local;
}

type GithubSyncState = {
  updated_at_remote: string | null;
  synced_at: string | null;
};

/**
 * Loads the timestamp pair which distinguishes a local edit from the issue
 * update caused by the preceding GitHub synchronization.
 */
async function readGithubIssueSyncState(
  issueId: string,
  remote: RemoteIssue,
): Promise<GithubSyncState | null> {
  if (remote.provider !== "github") return null;
  const { data, error } = await getServiceClient()
    .from("github_issue_sync_metadata")
    .select("updated_at_remote, synced_at")
    .eq("issue_id", issueId)
    .maybeSingle();
  if (error) {
    console.error(`[issue-sync] GitHub sync state lookup failed for issue ${issueId}:`, error.message);
    return null;
  }
  return data as GithubSyncState | null;
}

/**
 * A minddy `updated_at` produced by the preceding GitHub sync must not make
 * every later GitHub delivery look stale. Once the sidecar was written after
 * that update, only a subsequent local issue update participates in LWW.
 */
function isStaleRemoteUpdate(params: {
  remoteUpdatedAt: string | null | undefined;
  localUpdatedAt: unknown;
  previousRemoteUpdatedAt: unknown;
  previousSyncedAt: unknown;
}): boolean {
  if (isOlderThanLocal(params.remoteUpdatedAt, params.previousRemoteUpdatedAt)) return true;

  const localUpdatedAt = typeof params.localUpdatedAt === "string" ? params.localUpdatedAt : null;
  const previousSyncedAt =
    typeof params.previousSyncedAt === "string" ? params.previousSyncedAt : null;
  if (
    localUpdatedAt &&
    previousSyncedAt &&
    !Number.isNaN(Date.parse(localUpdatedAt)) &&
    !Number.isNaN(Date.parse(previousSyncedAt)) &&
    Date.parse(localUpdatedAt) <= Date.parse(previousSyncedAt)
  ) {
    return false;
  }
  return isOlderThanLocal(params.remoteUpdatedAt, params.localUpdatedAt);
}

/**
 * Persists GitHub fields that do not map to a minddy issue column. A newer
 * webhook always wins; an older delivery can never roll back the sidecar.
 */
async function syncGithubMetadata(issueId: string, remote: RemoteIssue): Promise<void> {
  if (remote.provider !== "github" || !remote.githubMetadata) return;
  const service = getServiceClient();
  const { data, error } = await service
    .from("github_issue_sync_metadata")
    .select("updated_at_remote")
    .eq("issue_id", issueId)
    .maybeSingle();
  if (error) {
    console.error(`[issue-sync] GitHub metadata lookup failed for issue ${issueId}:`, error.message);
    return;
  }
  if (isOlderThanLocal(remote.updatedAt, data?.updated_at_remote)) return;
  const metadata = remote.githubMetadata;
  const { error: writeError } = await service.from("github_issue_sync_metadata").upsert(
    {
      issue_id: issueId,
      github_node_id: metadata.nodeId,
      author_login: metadata.authorLogin,
      author_association: metadata.authorAssociation,
      state_reason: metadata.stateReason,
      locked: metadata.locked,
      active_lock_reason: metadata.activeLockReason,
      milestone: metadata.milestone,
      created_at_remote: metadata.createdAt,
      updated_at_remote: remote.updatedAt,
      closed_at_remote: metadata.closedAt,
      closed_by_login: metadata.closedByLogin,
      metadata: { issue_type: metadata.issueType },
      synced_at: new Date().toISOString(),
    },
    { onConflict: "issue_id" },
  );
  if (writeError) {
    console.error(`[issue-sync] GitHub metadata write failed for issue ${issueId}:`, writeError.message);
  }
}

/**
 * The labels of the distant outcome, placed in project categories - replacement
 * complete when she wears one: a label removed from her removes the category
 * here, it is the meaning of the reflection.
 *
 * An issue WITHOUT any label does not touch anything, by the same rule as the block
 * above: a repository that does not label its issues must not scan, at
 * each webhook, the categories stored by hand in minddy. Remove the
 * LAST label at the forge therefore does not empty the categories here - the price,
 * assumed, not to confuse "nothing to say" and "nothing".
 *
 * Best-effort and apart from `updateIssueFields`: the categories live in a
 * join table, with their own write path (`setIssueCategories`)
 * and their own timeline events.
 */
async function applyRemoteLabels(
  target: IssueSyncTarget,
  issueId: string,
  labels: string[],
): Promise<void> {
  if (!target.createdBy || labels.length === 0) return;
  const resolved = await resolveCategoryIdsByName(target.projectId, labels);
  if (!resolved) return;
  // SPLIT: `readForgeLabels` separates two labels that `categoryKey` can
  // bring back to the same category (it trims the accents, the key does not; it keeps
  // integer two names that the 200 character limit confuses). A repeated id
  // would fail the comparison below, and the DELETE/INSERT would start again
  // every webhook — precisely what it is there to avoid.
  const ids = [
    ...new Set(
      labels
        .map((label) => resolved.idByKey.get(categoryKey(label)))
        .filter((id): id is string => !!id),
    ),
  ];

  const service = getServiceClient();
  const { data: current } = await service
    .from("issue_categories")
    .select("category_id")
    .eq("issue_id", issueId);
  const before = new Set((current ?? []).map((r) => r.category_id as string));
  // Nothing has changed: do not rewrite. `setIssueCategories` does a DELETE then
  // an INSERT, and replaying it on each webhook would flash the categories
  // on all open tables, in real time, without anything happening.
  if (before.size === ids.length && ids.every((id) => before.has(id))) return;

  const result = await setIssueCategories({
    issueId,
    actorId: target.createdBy,
    categoryIds: ids,
    // The timeline credits the forge, not the owner who activated the sync: this
    // he was not the one who applied this label.
    forgeSync: target.provider,
  });
  if (!result.ok) {
    console.error(
      `[issue-sync] categories failed for issue ${issueId}:`,
      result.errorKey ?? result.rawMessage,
    );
  }
}

/** Complete fan-out of an event: all active bindings in the repository. */
export async function syncRemoteIssueEvent(remote: RemoteIssue): Promise<void> {
  const targets = await listIssueSyncTargets({
    provider: remote.provider,
    repoId: remote.repoId,
  });
  for (const target of targets) {
    try {
      await applyRemoteIssue(target, remote);
    } catch (err) {
      console.error(
        `[issue-sync] target ${target.linkId} failed:`,
        (err as Error).message,
      );
    }
  }
  await refreshRepoFullName(targets, remote.repoFullName);
}

/**
 * Mirrors a GitHub issue comment to each linked project that already imported
 * the parent issue. The remote comment id is the deduplication key; edits and
 * deletions update the existing minddy comment instead of creating a new one.
 */
export async function syncGithubIssueComment(comment: GithubIssueComment): Promise<void> {
  const targets = await listIssueSyncTargets({ provider: "github", repoId: comment.repoId });
  for (const target of targets) {
    if (!target.createdBy) continue;
    try {
      await applyGithubIssueComment(target, comment);
    } catch (error) {
      console.error(
        `[issue-sync] GitHub comment ${comment.remoteCommentId} for target ${target.linkId} failed:`,
        (error as Error).message,
      );
    }
  }
}

/** Mirrors supported GitHub blocking dependencies once both issues exist in a project. */
export async function syncGithubIssueDependency(
  dependency: GithubIssueDependency,
): Promise<void> {
  const targets = await listIssueSyncTargets({
    provider: "github",
    repoId: dependency.blockedRepoId,
  });
  for (const target of targets) {
    if (!target.createdBy) continue;
    try {
      const service = getServiceClient();
      const [blocking, blocked] = await Promise.all([
        service
          .from("issues")
          .select("id")
          .is("deleted_at", null)
          .eq("project_id", target.projectId)
          .eq("remote_provider", "github")
          .eq("remote_repo_id", dependency.blockingRepoId)
          .eq("remote_number", dependency.blockingNumber)
          .maybeSingle(),
        service
          .from("issues")
          .select("id")
          .is("deleted_at", null)
          .eq("project_id", target.projectId)
          .eq("remote_provider", "github")
          .eq("remote_repo_id", dependency.blockedRepoId)
          .eq("remote_number", dependency.blockedNumber)
          .maybeSingle(),
      ]);
      if (blocking.error || blocked.error || !blocking.data || !blocked.data) {
        console.warn(
          `[issue-sync] GitHub dependency skipped for target ${target.linkId}: an issue is not imported`,
        );
        continue;
      }
      const sourceId = blocking.data.id as string;
      const targetId = blocked.data.id as string;
      if (dependency.action === "added") {
        const result = await addIssueRelation({
          projectId: target.projectId,
          actorId: target.createdBy,
          sourceId,
          targetId,
          type: "blocks",
        });
        if (!result.ok) throw new Error(result.errorKey ?? result.rawMessage);
      } else {
        const relation = await findIssueRelation(
          target.projectId,
          sourceId,
          "blocks",
          targetId,
        );
        if (!relation) continue;
        const result = await removeIssueRelation({
          relationId: relation.id,
          actorId: target.createdBy,
        });
        if (!result.ok) throw new Error(result.errorKey ?? result.rawMessage);
      }
    } catch (error) {
      console.error(
        `[issue-sync] GitHub dependency ${dependency.blockingNumber}→${dependency.blockedNumber} failed for target ${target.linkId}:`,
        (error as Error).message,
      );
    }
  }
}

async function applyGithubIssueComment(
  target: IssueSyncTarget,
  remote: GithubIssueComment,
): Promise<void> {
  const service = getServiceClient();
  const { data: issue, error: issueError } = await service
    .from("issues")
    .select("id")
    .is("deleted_at", null)
    .eq("project_id", target.projectId)
    .eq("remote_provider", "github")
    .eq("remote_repo_id", remote.repoId)
    .eq("remote_number", remote.number)
    .maybeSingle();
  if (issueError || !issue) return;

  const issueId = issue.id as string;
  const { data: synced, error: syncedError } = await service
    .from("github_issue_comment_syncs")
    .select("comment_id, updated_at_remote, synced_at")
    .eq("remote_comment_id", remote.remoteCommentId)
    .eq("issue_id", issueId)
    .maybeSingle();
  if (syncedError) throw new Error(syncedError.message);

  let commentUpdatedAt: string | null = null;
  if (synced?.comment_id) {
    const { data: localComment, error: commentError } = await service
      .from("comments")
      .select("updated_at")
      .eq("id", synced.comment_id as string)
      .eq("issue_id", issueId)
      .maybeSingle();
    if (commentError) throw new Error(commentError.message);
    commentUpdatedAt = (localComment?.updated_at as string | null | undefined) ?? null;
  }
  if (
    synced &&
    isStaleRemoteUpdate({
      remoteUpdatedAt: remote.updatedAt,
      localUpdatedAt: commentUpdatedAt,
      previousRemoteUpdatedAt: synced.updated_at_remote,
      previousSyncedAt: synced.synced_at,
    })
  ) {
    return;
  }

  const body = remote.action === "deleted" ? "[Deleted on GitHub]" : remote.body;
  let commentId = synced?.comment_id as string | undefined;
  if (commentId) {
    const { error } = await service
      .from("comments")
      .update({ body })
      .eq("id", commentId)
      .eq("issue_id", issueId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await service
      .from("comments")
      .insert({
        issue_id: issueId,
        author_id: target.createdBy,
        body,
        created_at: remote.createdAt ?? new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "comment insert returned no id");
    commentId = data.id as string;
  }

  const { error: writeError } = await service.from("github_issue_comment_syncs").upsert(
    {
      remote_comment_id: remote.remoteCommentId,
      issue_id: issueId,
      comment_id: commentId,
      author_login: remote.authorLogin,
      author_association: remote.authorAssociation,
      html_url: remote.htmlUrl,
      created_at_remote: remote.createdAt,
      updated_at_remote: remote.updatedAt,
      deleted_at_remote: remote.action === "deleted" ? remote.updatedAt ?? new Date().toISOString() : null,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "remote_comment_id,issue_id" },
  );
  if (writeError) throw new Error(writeError.message);
}

function toGithubIssueComment(
  repoId: string,
  number: number,
  comment: RemoteGithubIssueComment,
): GithubIssueComment {
  return {
    repoId,
    number,
    remoteCommentId: comment.id,
    action: "created",
    body: comment.body,
    authorLogin: comment.authorLogin,
    authorAssociation: comment.authorAssociation,
    htmlUrl: comment.htmlUrl,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

/**
 * Replays the current comment history after a GitHub backfill. The sidecar
 * identity makes this safe when a live webhook was delivered at the same time.
 */
async function backfillGithubIssueComments(
  target: IssueSyncTarget,
  issues: BackfilledIssue[],
): Promise<void> {
  if (target.installationId == null || !target.repoFullName) return;
  for (const issue of issues) {
    try {
      const comments = await listGithubIssueComments(
        target.installationId,
        target.repoFullName,
        issue.number,
      );
      for (const comment of comments) {
        await applyGithubIssueComment(
          target,
          toGithubIssueComment(target.externalRepoId, issue.number, comment),
        );
      }
    } catch (error) {
      console.error(
        `[issue-sync] GitHub comment backfill failed for ${target.repoFullName}#${issue.number}:`,
        (error as Error).message,
      );
    }
  }
}

/** Stores GitHub-only fields for every issue already present after the bulk import. */
async function backfillGithubMetadata(
  target: IssueSyncTarget,
  issues: BackfilledIssue[],
): Promise<void> {
  const numbers = issues.map((issue) => issue.number);
  if (numbers.length === 0) return;
  const service = getServiceClient();
  const { data, error } = await service
    .from("issues")
    .select("id, remote_number")
    .is("deleted_at", null)
    .eq("project_id", target.projectId)
    .eq("remote_provider", "github")
    .eq("remote_repo_id", target.externalRepoId)
    .in("remote_number", numbers);
  if (error) {
    console.error("[issue-sync] GitHub metadata backfill lookup failed:", error.message);
    return;
  }
  const idByNumber = new Map(
    (data ?? []).map((row) => [row.remote_number as number, row.id as string]),
  );
  for (const issue of issues) {
    const issueId = idByNumber.get(issue.number);
    if (issueId) await syncGithubMetadata(issueId, toGithubBackfilledRemote(target, issue));
  }
}

/**
 * The name of the stored repository follows the one that the forge has just announced.
 *
 * Since MIN-333 the name no longer ROUTES anything — it's the id that does it. It only serves
 * to display itself and to compose URLs, and as such it must remain
 * just: a renamed repository at the forge would otherwise keep its old name in the
 * project settings and in the links of imported tickets, indefinitely.
 *
 * Best-effort, and only when it has moved: this path passes to each webhook.
 */
async function refreshRepoFullName(
  targets: IssueSyncTarget[],
  repoFullName: string,
): Promise<void> {
  const stale = targets.filter(
    (t) => !!repoFullName && t.repoFullName !== repoFullName,
  );
  if (stale.length === 0) return;
  const cut = repoFullName.lastIndexOf("/");
  const patch: Record<string, unknown> = {
    repo_full_name: repoFullName,
    // The owner is what precedes the LAST `/` — the rule applies to
    // two forges, including a nested GitLab group (`groupe/sous-groupe`).
    repo_owner: cut > 0 ? repoFullName.slice(0, cut) : null,
    updated_at: new Date().toISOString(),
  };
  // `repo_name` does not have the same meaning on both sides: at GitHub it is the
  // last segment of the path, at GitLab the display NAME of the project, that the
  // payload of an issue does not carry. We therefore only rewrite the one we
  // sait dire juste.
  if (targets[0]?.provider === "github" && cut >= 0) {
    patch.repo_name = repoFullName.slice(cut + 1);
  }
  const service = getServiceClient();
  const { error } = await service
    .from("project_git_links")
    .update(patch)
    .in(
      "id",
      stale.map((t) => t.linkId),
    );
  if (error) console.error("[issue-sync] repo rename failed:", error.message);
}

// --- Backfill on activation ------------------------------------------------

/** The remote numbers already present in the project, for this repository. */
async function loadImportedNumbers(
  target: IssueSyncTarget,
): Promise<Set<number>> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("issues")
    .select("remote_number")
    .is("deleted_at", null)
    .eq("project_id", target.projectId)
    .eq("remote_provider", target.provider)
    .eq("remote_repo_id", target.externalRepoId);
  if (error) {
    console.error("[issue-sync] backfill lookup failed:", error.message);
    return new Set();
  }
  return new Set(
    (data ?? [])
      .map((r) => r.remote_number as number | null)
      .filter((n): n is number => typeof n === "number"),
  );
}

/** A remote exit from the backfill, as rendered by the two forges. */
interface BackfilledIssue {
  number: number;
  title: string;
  body: string | null;
  url: string | null;
  labels: string[];
  assigneeLogins: string[];
  dueDate: string | null;
  createdAt: string | null;
  closedAt: string | null;
  updatedAt?: string | null;
  githubMetadata?: RemoteIssue["githubMetadata"];
}

function toGithubBackfilledRemote(
  target: IssueSyncTarget,
  issue: BackfilledIssue,
): RemoteIssue {
  return {
    provider: "github",
    repoFullName: target.repoFullName ?? "",
    repoId: target.externalRepoId,
    number: issue.number,
    title: issue.title,
    body: issue.body,
    url: issue.url,
    action: "backfill",
    actorLogin: null,
    state: "open",
    labels: issue.labels,
    assigneeLogins: issue.assigneeLogins,
    dueDate: issue.dueDate,
    updatedAt: issue.updatedAt ?? null,
    githubMetadata: issue.githubMetadata ?? null,
  };
}

/** A remote output, brought back to the expected form by the bulk import. */
function toImportedIssue(
  target: IssueSyncTarget,
  issue: BackfilledIssue,
  assignees: ForgeAssigneeIndex,
): ImportedIssue {
  // Labels carry three things at once: priority, size, and
  // rest — which becomes project categories.
  const { priority, effort, labels } = readForgeLabels(issue.labels);
  const resource = forgeIssueResource({
    provider: target.provider,
    repoFullName: target.repoFullName,
    number: issue.number,
    url: issue.url,
  });
  return {
    title: issue.title || `#${issue.number}`,
    description: issue.body,
    status: REMOTE_LANDING_STATUS,
    priority,
    effort,
    labels,
    // The forge account becomes a member of the project again when this person has
    // connected his (MIN-144) — otherwise `null`, and nothing is guessed.
    assigneeId: matchForgeAssignee(issue.assigneeLogins, assignees),
    dueDate: issue.dueDate,
    createdAt: issue.createdAt,
    completedAt: issue.closedAt,
    externalKeys: [],
    parentExternalKey: null,
    remote: {
      provider: target.provider,
      repoId: target.externalRepoId,
      number: issue.number,
      url: issue.url,
    },
    resources: resource ? [resource] : undefined,
  };
}

/**
 * Imports OPEN issues from the repository linked to toggle activation. Issues
 * already closed on the provider side are NOT repatriated: synchronization is used to monitor
 * the work in progress, not to copy a history.
 *
 * Returns the number of tickets created (0 if everything was already there). Best-effort:
 * the toggle is already written when this function runs (in `after()`), a
 * failure here does not reset it to false — subsequent events will pass.
 */
export async function backfillRemoteIssues(
  target: IssueSyncTarget,
): Promise<number> {
  if (!target.createdBy) return 0;

  // Only one quota check for the entire batch: the limit is one
  // garde-fou d'offre, pas un compteur exact (l'import CSV fait pareil).
  try {
    await ensureIssueLimit(target.projectId);
  } catch (err) {
    if (isPlanLimitError(err)) {
      console.warn(
        `[issue-sync] backfill skipped for project ${target.projectId}: issue limit reached`,
      );
      return 0;
    }
    throw err;
  }

  let remoteIssues: BackfilledIssue[];
  if (target.provider === "github") {
    if (target.installationId == null || !target.repoFullName) return 0;
    const issues = await listRepoOpenIssues(
      target.installationId,
      target.repoFullName,
      REMOTE_BACKFILL_MAX,
    );
    remoteIssues = issues.map((i) => ({
      number: i.number,
      title: i.title,
      body: i.body,
      url: i.htmlUrl,
      labels: i.labels,
      assigneeLogins: i.assigneeLogins,
      dueDate: i.dueDate ?? null,
      createdAt: i.createdAt ?? null,
      closedAt: i.closedAt ?? null,
      updatedAt: i.updatedAt ?? null,
      githubMetadata: i.githubMetadata,
    }));
  } else {
    const token = await getGitlabAccessToken(target.connectionId);
    const issues = await listGitlabOpenIssues(
      token,
      target.externalRepoId,
      REMOTE_BACKFILL_MAX,
    );
    remoteIssues = issues.map((i) => ({
      number: i.iid,
      title: i.title,
      body: i.description,
      url: i.webUrl,
      labels: i.labels,
      assigneeLogins: i.assigneeLogins,
      dueDate: null,
      createdAt: null,
      closedAt: null,
    }));
  }

  const alreadyImported = await loadImportedNumbers(target);
  const fresh = remoteIssues.filter((i) => !alreadyImported.has(i.number));

  let created = 0;
  if (fresh.length > 0) {
    // Only one index construction for the whole batch: that's two queries,
    // where doing it per ticket would make two per ticket.
    const assignees = await buildForgeAssigneeIndex({
      projectId: target.projectId,
      provider: target.provider,
    });
    const result = await importIssuesIntoProject({
      projectId: target.projectId,
      actorId: target.createdBy,
      issues: fresh.map((i) => toImportedIssue(target, i, assignees)),
      source: target.provider,
    });
    if (!result.ok) {
      console.error("[issue-sync] backfill import failed:", result.errorKey);
      return 0;
    }
    created = result.result.created;
  }

  if (target.provider === "github") {
    await backfillGithubMetadata(target, remoteIssues);
    await backfillGithubIssueComments(target, remoteIssues);
  }

  const service = getServiceClient();
  await service
    .from("project_git_links")
    .update({ issue_sync_backfilled_at: new Date().toISOString() })
    .eq("id", target.linkId);

  return created;
}
