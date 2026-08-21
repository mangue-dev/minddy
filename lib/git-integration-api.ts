"use client";

import type { RepoProviderId } from "./repo-providers";
import type {
  AgentBranchesResponse,
  BranchDeletionResult,
  CandidateRepo,
  GitConnection,
  GitIdentity,
  ProjectGitLink,
} from "./types";
import { trackEvent } from "./analytics";

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  return data as T;
}

// ── Project level (project settings) ────────────────────────────────────

export interface ProviderConnectInfo {
  id: RepoProviderId;
  /** The provider is configured on the server side (env present). */
  configured: boolean;
  /** Reusable connection of the owner for this provider (or null). */
  connection: { id: string; account_login: string | null } | null;
}

export interface ProjectGitLinkResponse {
  link: ProjectGitLink | null;
  isOwner: boolean;
  providers: ProviderConnectInfo[];
  /**
 * URL where to grant “Issues (Write)” when sync is active but
 * the GitHub installation only accepted reading: the import works, the
 * RETURN (close the remote issue) does not. Recalculated on each read — it
 * clears itself as soon as permission is granted. Null the rest of the
 * time, and for everyone except the owner.
 */
  writeMissingUrl: string | null;
}

export type StartConnectResponse =
  | { mode: "reuse"; connectionId: string }
  | { mode: "install" | "oauth"; url: string }
  /** Relay-only instance: the official minddy App is claimed through the
   * managed forge relay. The client opens the claim interstitial with `code`,
   * which polls until the installation is bound to this instance; the claim
   * URL is derived server-side by the poll itself, never passed along. */
  | { mode: "claim"; url: string; code: string };

export async function fetchProjectGitLinkApi(
  projectId: string,
): Promise<ProjectGitLinkResponse> {
  return parseJson(await fetch(`/api/projects/${projectId}/git-link`));
}

/** Projects that have a linked repository — those where the agent can work. */
export async function fetchGitLinkedProjectsApi(): Promise<{ projectIds: string[] }> {
  return parseJson(await fetch(`/api/projects/git-linked`));
}

export async function fetchGitCandidatesApi(
  projectId: string,
  connectionId: string,
): Promise<{ candidates: CandidateRepo[] }> {
  return parseJson(
    await fetch(
      `/api/projects/${projectId}/git-link?candidates=${encodeURIComponent(connectionId)}`,
    ),
  );
}

export async function startGitConnectApi(
  projectId: string,
  provider: RepoProviderId,
): Promise<StartConnectResponse> {
  return parseJson(
    await fetch(`/api/projects/${projectId}/git-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", provider }),
    }),
  );
}

export async function bindGitRepoApi(
  projectId: string,
  connectionId: string,
  externalRepoId: string,
): Promise<{ link: ProjectGitLink }> {
  return parseJson(
    await fetch(`/api/projects/${projectId}/git-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "bind",
        connection_id: connectionId,
        external_repo_id: externalRepoId,
      }),
    }),
  );
}

/**
 * Toggles the synchronization of outputs from the linked repository (MIN-97). Returns the binding
 * refreshed — the backfill runs on the server side after the response and
 * arrives via realtime.
 *
 * `writeMissingUrl` is only present upon activation, and only when
 * the GitHub installation has not accepted that `Issues (Read)`: the import works, but
 * close an issue from minddy requests `write`. This is the URL of the page where
 * grants it.
 */
export async function setGitIssueSyncApi(
  projectId: string,
  enabled: boolean,
  provider: RepoProviderId,
): Promise<{ link: ProjectGitLink | null; writeMissingUrl?: string | null }> {
  trackEvent("project_git_issue_sync_toggled", { provider, enabled });
  return parseJson(
    await fetch(`/api/projects/${projectId}/git-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "issue_sync", enabled }),
    }),
  );
}

/**
 * All branches that minddy pushed to the linked repository and which still exist
 * (MIN-102), with their status. The server recalculates this list when deleting: what is displayed here is only a proposal, not an authorization.
 */
export async function fetchAgentBranchesApi(
  projectId: string,
): Promise<AgentBranchesResponse> {
  return parseJson(await fetch(`/api/projects/${projectId}/git-link/agent-branches`));
}

export async function deleteAgentBranchesApi(
  projectId: string,
  branches: string[],
  provider: RepoProviderId,
): Promise<{ results: BranchDeletionResult[] }> {
  const res = await parseJson<{ results: BranchDeletionResult[] }>(
    await fetch(`/api/projects/${projectId}/git-link/agent-branches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branches }),
    }),
  );
  const deleted = res.results.filter((r) => r.ok).length;
  trackEvent("project_git_branches_cleaned", {
    provider,
    deleted,
    failed: res.results.length - deleted,
  });
  return res;
}

export async function unlinkGitRepoApi(projectId: string): Promise<void> {
  trackEvent("project_git_unlinked", { provider: "unknown" });
  await parseJson(
    await fetch(`/api/projects/${projectId}/git-link`, { method: "DELETE" }),
  );
}

// ── Account level (account settings) ────────────────────────────────────

export interface GitConnectionsResponse {
  connections: GitConnection[];
  providers: { id: RepoProviderId; configured: boolean }[];
}

export async function fetchGitConnectionsApi(): Promise<GitConnectionsResponse> {
  return parseJson(await fetch("/api/account/git-connections"));
}

/**
 * Starts a git connection at the ACCOUNT level — from the account settings,
 * or from the build wizard (MIN-62), which chooses a repository before the
 * project exists. `mode: "reuse"` = no page exit; the two other modes
 * leave the app, the caller saves its draft before following `url`.
 *
 * `origin` says where we start from, and therefore where the callback returns — table closed on the server side
 *. Both callers pass it in plain text: a silent fault
 * would send the wizard to the wrong page without anything indicating it.
 */
export async function startAccountGitConnectApi(
  provider: RepoProviderId,
  origin: "wizard" | "settings",
): Promise<StartConnectResponse> {
  return parseJson(
    await fetch("/api/account/git-connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", provider, origin }),
    }),
  );
}

/** Candidate deposits of an account connection (same list, without project). */
export async function fetchAccountGitCandidatesApi(
  connectionId: string,
): Promise<{ candidates: CandidateRepo[] }> {
  return parseJson(
    await fetch(
      `/api/account/git-connections?candidates=${encodeURIComponent(connectionId)}`,
    ),
  );
}

export async function disconnectGitConnectionApi(id: string): Promise<void> {
  trackEvent("git_connection_removed", { provider: "unknown" });
  await parseJson(
    await fetch(`/api/account/git-connections/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  );
}

// ── Personal git account (PR gesture identity, MIN-144) ───────────────

export interface GitIdentitiesResponse {
  identities: GitIdentity[];
  providers: { id: RepoProviderId; configured: boolean }[];
}

export async function fetchGitIdentitiesApi(): Promise<GitIdentitiesResponse> {
  return parseJson(await fetch("/api/account/git-identities"));
}

/**
 * Starts authorization of personal git account. Always a page exit
 * (user authorizes at the forge): the caller follows `url`. `origin` says
 * where it leaves, and therefore where the callback brings it back — table closed on the server side.
 */
export async function startGitIdentityConnectApi(
  provider: RepoProviderId,
  origin?: "settings" | "pr",
): Promise<{ url: string }> {
  trackEvent("git_identity_connect_started", { provider });
  return parseJson(
    await fetch("/api/account/git-identities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", provider, origin }),
    }),
  );
}

export async function disconnectGitIdentityApi(
  id: string,
  provider: RepoProviderId,
): Promise<void> {
  trackEvent("git_identity_removed", { provider });
  await parseJson(
    await fetch(`/api/account/git-identities/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  );
}
