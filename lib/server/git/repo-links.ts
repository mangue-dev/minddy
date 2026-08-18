import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";
import type { CandidateRepo, ProjectGitLink } from "@/lib/types";
import { getUserConnection } from "./connections";
import { listInstallationRepositories } from "./github-app";
import { getGitlabAccessToken, listGitlabProjects } from "./gitlab-app";

/**
 * Access to project link ↔ repository (project_git_links) — MIN-47. Customer service;
 * the gate owner is done at the route level (getProjectAccess). A project can only
 * link one repository (UNIQUE constraint on project_id).
 */

interface LinkRow {
  id: string;
  provider: string;
  connection_id: string;
  external_repo_id: string;
  repo_owner: string | null;
  repo_name: string | null;
  repo_full_name: string | null;
  default_branch: string | null;
  issue_sync_enabled: boolean | null;
  issue_sync_backfilled_at: string | null;
  created_at: string;
}

/** Current link of the project (with the login of the connected account), or null. */
export async function getProjectLink(
  projectId: string,
): Promise<ProjectGitLink | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("project_git_links")
    .select(
      "id, provider, connection_id, external_repo_id, repo_owner, repo_name, repo_full_name, default_branch, issue_sync_enabled, issue_sync_backfilled_at, created_at, git_connections(account_login)",
    )
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data) return null;
  // Embedded to-one relationship: object at runtime, cast via unknown (see Supabase).
  const row = data as unknown as LinkRow & {
    git_connections: { account_login: string | null } | null;
  };
  return {
    id: row.id,
    provider: row.provider as RepoProviderId,
    connection_id: row.connection_id,
    external_repo_id: row.external_repo_id,
    repo_owner: row.repo_owner,
    repo_name: row.repo_name,
    repo_full_name: row.repo_full_name,
    default_branch: row.default_branch,
    account_login: row.git_connections?.account_login ?? null,
    issue_sync_enabled: row.issue_sync_enabled === true,
    issue_sync_backfilled_at: row.issue_sync_backfilled_at,
    created_at: row.created_at,
  };
}

/**
 * Lists the candidate repositories of a connection (dispatch by provider). Used by
 * the repository selector. Raised if the provider is unknown or the API call fails.
 */
export async function listCandidateRepos(
  connection: { id: string; provider: RepoProviderId; installation_id: number | null },
): Promise<CandidateRepo[]> {
  if (connection.provider === "github") {
    if (connection.installation_id == null) {
      throw new Error("GitHub connection is missing its installation id");
    }
    const repos = await listInstallationRepositories(connection.installation_id);
    return repos.map((r) => ({
      external_repo_id: String(r.id),
      owner: r.owner,
      name: r.name,
      full_name: r.fullName,
      default_branch: r.defaultBranch,
    }));
  }
  // gitlab
  const token = await getGitlabAccessToken(connection.id);
  const projects = await listGitlabProjects(token);
  return projects.map((p) => ({
    external_repo_id: p.id,
    owner: p.pathWithNamespace.includes("/")
      ? p.pathWithNamespace.slice(0, p.pathWithNamespace.lastIndexOf("/"))
      : null,
    name: p.name,
    full_name: p.pathWithNamespace,
    default_branch: p.defaultBranch,
  }));
}

export type BindResult =
  | { ok: true; link: ProjectGitLink }
  | { ok: false; errorKey: "connectionNotFound" | "repoNotFound"; status: number };

/**
 * Links a repository to a project. Verifies that the connection belongs to the user,
 * re-lists the candidates to find the SERVER METADATA of the repository (never trusting the client values) and upserts the binding (unique per project).
 */
export async function bindRepo(params: {
  projectId: string;
  userId: string;
  connectionId: string;
  externalRepoId: string;
}): Promise<BindResult> {
  const connection = await getUserConnection(params.userId, params.connectionId);
  if (!connection) {
    return { ok: false, errorKey: "connectionNotFound", status: 404 };
  }

  const candidates = await listCandidateRepos(connection);
  const repo = candidates.find(
    (c) => c.external_repo_id === params.externalRepoId,
  );
  if (!repo) {
    return { ok: false, errorKey: "repoNotFound", status: 404 };
  }

  const supabase = getServiceClient();
  const nowIso = new Date().toISOString();
  const values = {
    project_id: params.projectId,
    connection_id: connection.id,
    provider: connection.provider,
    installation_id: connection.installation_id,
    external_repo_id: repo.external_repo_id,
    repo_owner: repo.owner,
    repo_name: repo.name,
    repo_full_name: repo.full_name,
    default_branch: repo.default_branch,
    created_by: params.userId,
    updated_at: nowIso,
  };

  const { error } = await supabase
    .from("project_git_links")
    .upsert(values, { onConflict: "project_id" });
  if (error) {
    throw new Error(error.message || "Failed to bind repository");
  }

  const link = await getProjectLink(params.projectId);
  if (!link) throw new Error("Failed to read bound repository");
  return { ok: true, link };
}

/** Unbinds a project repository. Returns false if no binding existed. */
export async function unlinkProject(projectId: string): Promise<boolean> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("project_git_links")
    .delete()
    .eq("project_id", projectId)
    .select("id")
    .maybeSingle();
  return !!data;
}
