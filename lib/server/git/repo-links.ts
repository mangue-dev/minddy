import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";
import type { CandidateRepo, ProjectGitLink } from "@/lib/types";
import { getUserConnection } from "./connections";
import { listInstallationRepositories } from "./github-app";
import { getGitlabAccessToken, listGitlabProjects } from "./gitlab-app";

/**
 * Accès à la liaison projet ↔ dépôt (project_git_links) — MIN-47. Service client ;
 * le gate owner est fait au niveau route (getProjectAccess). Un projet ne peut
 * lier qu'un seul dépôt (contrainte UNIQUE sur project_id).
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
  created_at: string;
}

/** Liaison courante du projet (avec le login du compte connecté), ou null. */
export async function getProjectLink(
  projectId: string,
): Promise<ProjectGitLink | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("project_git_links")
    .select(
      "id, provider, connection_id, external_repo_id, repo_owner, repo_name, repo_full_name, default_branch, created_at, git_connections(account_login)",
    )
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data) return null;
  // Relation to-one embarquée : objet au runtime, cast via unknown (cf. Supabase).
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
    created_at: row.created_at,
  };
}

/**
 * Liste les dépôts candidats d'une connexion (dispatch par provider). Utilisé par
 * le sélecteur de dépôt. Lève si le provider est inconnu ou l'appel API échoue.
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
 * Lie un dépôt à un projet. Vérifie que la connexion appartient à l'utilisateur,
 * re-liste les candidats pour retrouver les MÉTADONNÉES SERVEUR du dépôt (jamais
 * de confiance dans les valeurs client) et upsert la liaison (unique par projet).
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

/** Délie le dépôt d'un projet. Renvoie false si aucune liaison n'existait. */
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
