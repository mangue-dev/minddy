import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getInstallationToken } from "@/lib/server/git/github-app";
import { getGitlabAccessToken } from "@/lib/server/git/gitlab-app";
import { GITLAB_HOST } from "@/lib/server/git/gitlab-rest";

/**
 * Résout de quoi cloner le dépôt lié à un projet dans le Sandbox de l'agent
 * (MIN-46 + MIN-69). On mint un token ÉPHÉMÈRE — token d'installation GitHub
 * (getInstallationToken, MIN-47) ou access token OAuth GitLab (refresh paresseux
 * via getGitlabAccessToken) — et on construit une URL de clone HTTPS
 * token-authentifiée — jamais persistée hors de la microVM.
 *
 * On lit directement `project_git_links` (qui dénormalise `installation_id`)
 * plutôt que getProjectLink(), car ce dernier ne renvoie pas l'installation_id
 * nécessaire au mint du token. À ré-appeler pour obtenir un token frais avant
 * chaque opération réseau (clone/push) d'un run long.
 */

export type RepoProvider = "github" | "gitlab";

export interface RepoCloneTarget {
  provider: RepoProvider;
  /** `owner/name`. */
  repoFullName: string;
  /** Branche de base (fallback "main" si le dépôt ne l'expose pas). */
  defaultBranch: string;
  /** URL HTTPS de clone/push avec token éphémère embarqué (jamais stockée). */
  authUrl: string;
  /** Token brut (pour d'éventuels appels REST : PR, etc.). */
  token: string;
  linkId: string;
  connectionId: string;
}

interface GitLinkRow {
  id: string;
  provider: string;
  connection_id: string;
  installation_id: number | null;
  repo_full_name: string | null;
  default_branch: string | null;
}

/**
 * Cible de clone du projet, ou null s'il n'a aucun dépôt lié. Lève si le lien
 * est incomplet (installation_id GitHub manquant) ou si le provider est inconnu.
 */
export async function resolveRepoCloneTarget(
  projectId: string,
): Promise<RepoCloneTarget | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("project_git_links")
    .select("id, provider, connection_id, installation_id, repo_full_name, default_branch")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!data) return null;
  const row = data as GitLinkRow;

  if (!row.repo_full_name) {
    throw new Error("Project git link is missing repo_full_name");
  }

  if (row.provider === "github") {
    if (row.installation_id == null) {
      throw new Error("GitHub link is missing its installation id");
    }
    const { token } = await getInstallationToken(row.installation_id);
    return {
      provider: "github",
      repoFullName: row.repo_full_name,
      defaultBranch: row.default_branch ?? "main",
      authUrl: `https://x-access-token:${token}@github.com/${row.repo_full_name}.git`,
      token,
      linkId: row.id,
      connectionId: row.connection_id,
    };
  }

  if (row.provider === "gitlab") {
    const token = await getGitlabAccessToken(row.connection_id);
    // Clone OAuth : user `oauth2`, mot de passe = l'access token (doc GitLab).
    const host = new URL(GITLAB_HOST).host;
    return {
      provider: "gitlab",
      repoFullName: row.repo_full_name,
      defaultBranch: row.default_branch ?? "main",
      authUrl: `https://oauth2:${token}@${host}/${row.repo_full_name}.git`,
      token,
      linkId: row.id,
      connectionId: row.connection_id,
    };
  }

  throw new Error(`Unknown repo provider '${row.provider}'`);
}
