import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { afterOrNow } from "@/lib/server/after-safe";
import type { IssueStatus } from "@/lib/issue-constants";
import type { RepoProviderId } from "@/lib/repo-providers";
import { GITHUB_API_BASE, githubHeaders } from "./github-rest";
import { GITLAB_API_BASE, gitlabHeaders } from "./gitlab-rest";
import { getInstallationToken } from "./github-app";
import { getGitlabAccessToken } from "./gitlab-app";
import { resolveForgeActor } from "./forge-actor";
import { remoteStateForStatus, type RemoteState } from "./issue-sync-core";

/**
 * RETURN of issue synchronization: the status of a minddy ticket closes or
 * reopens the issue from which it comes.
 *
 * MIN-97 posed a “one-way STRICT: nothing here is written to the provider”.
 * This module raises this rule on ONE field, and on only one: the open state /
 * closed. Neither the title, nor the body, nor the labels, nor the assigned ones go back
 * - the forge remains the source of these (see `applyRemoteIssue`), and a
 * round trip in two directions on the same fields would not have a winner.
 *
 * Why does the state deserve both ways: an issue opened on the
 * repository while the minddy project exists will likely be processed on the
 * repository. But whoever finishes it can very well say it in minddy — and
 * leave behind an open GitHub issue that no one closes anymore.
 *
 * **The loop does not close**, and this is intended in three places:
 * 1. `updateIssueFields` does not call this ONLY if the writing does not come from the
 * forge (`forgeSync` null) — a status descended from the webhook does not go up;
 * 2. the echo that GitHub returns (`issues.closed`) finds a ticket ALREADY in
 * the desired state, therefore `applyRemoteIssue` doesn't patch anything ;
 * 3. we only push if the remote state CHANGES — a `done` → `canceled` remains
 * `closed` on both sides and does nothing call.
 *
 * **Who signs.** The gesture is HUMAN: someone has moved a card. So the
 * git account of this person first (`resolveForgeActor`, like gestures
 * on a pull request), and the App / connection link only otherwise.
 * GitHub then displays "minddy has closed" — approximation assumed, the same
 * as in MIN-146 on the GitLab side: without it, sync would silently stall
 * for all those who have not connected an account, which is worse.
 *
 * Best-effort and off critical path (`afterOrNow`): a broken forge should never do
 * fail to move a card.
 */

/** What a connection must provide so that one can write at the forge. */
interface PushTarget {
  provider: RepoProviderId;
  connectionId: string;
  installationId: number | null;
  repoFullName: string | null;
  externalRepoId: string;
}

/** The ticket that is pushed — the distant identity that he already carries. */
export interface RemoteIssueIdentity {
  projectId: string;
  provider: string | null;
  repoId: string | null;
  number: number | null;
}

/**
 * Programs the repercussion of a change of status at the forge. No-op
 * silent for a ticket born in minddy (almost all): the guard is
 * a comparison of fields already loaded, no query.
 */
export function scheduleRemoteStatusPush(params: {
  issue: RemoteIssueIdentity;
  status: IssueStatus;
  actorId: string;
}): void {
  const { provider, repoId, number } = params.issue;
  if (!provider || !repoId || number == null) return;
  const state = remoteStateForStatus(params.status);
  afterOrNow(() =>
    pushRemoteState({
      projectId: params.issue.projectId,
      provider: provider as RepoProviderId,
      repoId,
      number,
      state,
      actorId: params.actorId,
    }),
  );
}

async function pushRemoteState(params: {
  projectId: string;
  provider: RepoProviderId;
  repoId: string;
  number: number;
  state: RemoteState;
  actorId: string;
}): Promise<void> {
  const service = getServiceClient();
  const { data } = await service
    .from("project_git_links")
    .select(
      "provider, connection_id, installation_id, repo_full_name, external_repo_id",
    )
    .eq("project_id", params.projectId)
    .eq("provider", params.provider)
    .eq("external_repo_id", params.repoId)
    // Cutting the sync cuts BOTH directions: the toggle is the only one
    // switch, and it would be incomprehensible if it only switches off one.
    .eq("issue_sync_enabled", true)
    .maybeSingle();
  if (!data) return;

  const target: PushTarget = {
    provider: data.provider as RepoProviderId,
    connectionId: data.connection_id as string,
    installationId: data.installation_id as number | null,
    repoFullName: data.repo_full_name as string | null,
    externalRepoId: data.external_repo_id as string,
  };

  const token = await resolveWriteToken(target, params.actorId);
  if (!token) {
    console.warn(
      `[issue-push] no writable token for project ${params.projectId} — skipped`,
    );
    return;
  }

  try {
    if (target.provider === "github") {
      await pushGithubState(token, target, params.number, params.state);
    } else {
      await pushGitlabState(token, target, params.number, params.state);
    }
  } catch (err) {
    console.error(
      `[issue-push] ${target.provider} #${params.number} → ` +
        `${params.state.open ? "open" : "closed"} failed:`,
      (err as Error).message,
    );
  }
}

/**
 * The token that will write: that of the actor if he has connected his account AND can
 * write to the repository, otherwise that of the link (the GitHub App, the connection
 * OAuth of the linker on the GitLab side).
 */
async function resolveWriteToken(
  target: PushTarget,
  actorId: string,
): Promise<string | null> {
  if (target.repoFullName) {
    const actor = await resolveForgeActor({
      userId: actorId,
      provider: target.provider,
      repoFullName: target.repoFullName,
    });
    // `read` is not enough to close an issue: we instead fall back on the App
    // que d'aller chercher un 403 au nom de quelqu'un qui n'y peut rien.
    if (actor.kind === "actor" && actor.capability !== "read") return actor.token;
  }

  try {
    if (target.provider === "github") {
      if (target.installationId == null) return null;
      const { token } = await getInstallationToken(target.installationId);
      return token;
    }
    return await getGitlabAccessToken(target.connectionId);
  } catch (err) {
    console.warn(`[issue-push] fallback token failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * `PATCH /repos/{repo}/issues/{n}`. `state_reason` distinguishes between the two ways of closing that GitHub displays differently (purple “completed” check versus
 * gray “not planned” circle) — this is the only nuance of our three closed statuses that survives traversal.
 *
 * Requests the `Issues: Write` permission from the GitHub App. An App that gains a
 * permission does NOT obtain it retroactively: each existing installation
 * must accept it (same trap as `getIssuesPermission`). Until
 * is done, GitHub responds **403 “Resource not accessible by integration”** — the
 * gesture is logged and abandoned, the ticket remains moved to minddy.
 */
async function pushGithubState(
  token: string,
  target: PushTarget,
  number: number,
  state: RemoteState,
): Promise<void> {
  if (!target.repoFullName) return;
  const body: Record<string, string> = { state: state.open ? "open" : "closed" };
  if (!state.open) body.state_reason = state.notPlanned ? "not_planned" : "completed";

  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${target.repoFullName}/issues/${number}`,
    {
      method: "PATCH",
      headers: { ...githubHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message || `HTTP ${response.status}`);
  }
}

/**
 * `PUT /projects/{id}/issues/{iid}`. GitLab does not take a state but a
 * TRANSITION (`state_event: close | reopen`), and has no equivalent of
 * `state_reason`: the three closed statuses of minddy close in the same way.
 */
async function pushGitlabState(
  token: string,
  target: PushTarget,
  number: number,
  state: RemoteState,
): Promise<void> {
  const response = await fetch(
    `${GITLAB_API_BASE}/projects/${encodeURIComponent(target.externalRepoId)}` +
      `/issues/${number}`,
    {
      method: "PUT",
      headers: { ...gitlabHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ state_event: state.open ? "reopen" : "close" }),
    },
  );
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message || `HTTP ${response.status}`);
  }
}
