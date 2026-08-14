import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
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
 *
 * DEPUIS MIN-327, le token n'est plus « celui de l'installation » : il est scopé
 * AU DÉPÔT du lien, et son pouvoir dépend de qui va le détenir — voir
 * `RepoTokenAccess` ci-dessous. C'est le même appel, avec un argument de plus,
 * parce que la question « que peut ce token ? » ne doit pas se poser loin de
 * l'endroit qui le fabrique.
 */

export type RepoProvider = "github" | "gitlab";

/**
 * CE QUE LE TOKEN A LE DROIT DE FAIRE (MIN-327), et qui le détiendra.
 *
 * Trois profils, et la ligne qui compte passe entre le premier et les deux
 * autres : `full` reste dans la FONCTION, `repo-write` et `repo-read` descendent
 * dans la MICROVM, où `git clone` les écrit dans `.git/config` et où le modèle
 * lance du shell.
 *
 * - `full` — le token maximal de l'installation SUR LE DÉPÔT LIÉ. Ouvrir une PR,
 *   commenter, relire, merger, fermer une issue : tout ce qui parle à l'API de
 *   la forge depuis nos routes. Il ne sort jamais du process.
 * - `repo-write` — `contents: write`, rien d'autre. C'est tout ce dont `git`
 *   a besoin (clone, fetch, ls-remote, push) et c'est tout ce que la microVM
 *   d'un run de ticket ou de carnet reçoit : le token qu'elle porte ne peut plus
 *   merger une PR, ni approuver, ni commenter — ces gestes-là passent par le
 *   plan de contrôle, qui les rejoue côté fonction sous l'ancrage du run.
 * - `repo-read` — `contents: read`. La RELECTURE, le seul ancrage dont le
 *   contenu vient d'un fork inconnu. Elle n'écrit rien dans le dépôt
 *   (`writesToRepo` dans execute.ts) : lui donner de quoi pousser était une
 *   contradiction, et une injection depuis le fork suffisait à la récolter.
 *
 * **GitLab ne connaît pas cette distinction, et c'est assumé.** Le token est
 * l'access token OAuth de la connexion, de portée `api` sur le compte entier
 * (cf. `GITLAB_OAUTH_SCOPES`) : GitLab n'offre aucun down-scoping d'un token
 * OAuth au moment de l'usage, et les project access tokens — le seul mécanisme
 * à portée réduite — sont des jetons PERSISTANTS à créer, suivre et révoquer,
 * pour une durée minimale d'un jour. Le profil est donc SANS EFFET côté GitLab,
 * et une relecture GitLab tourne avec un token qui peut écrire. C'est dit ici,
 * dans SECURITY.md et dans l'UI de liaison — comme l'absence d'identité de bot
 * (MIN-146), c'est une contrainte de la plateforme, pas un oubli.
 */
export type RepoTokenAccess = "full" | "repo-write" | "repo-read";

/** Les permissions GitHub demandées au mint, par profil. `full` ne narrowe rien
 *  (le token garde celles de l'installation) — la restriction qui compte pour lui
 *  est la portée par dépôt, posée dans tous les cas. */
const GITHUB_PERMISSIONS_BY_ACCESS: Record<
  RepoTokenAccess,
  Record<string, "read" | "write"> | undefined
> = {
  full: undefined,
  "repo-write": { contents: "write" },
  "repo-read": { contents: "read" },
};

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
  project_id?: string;
}

const GIT_LINK_COLUMNS =
  "id, provider, connection_id, installation_id, repo_full_name, default_branch";

/**
 * Cible de clone du projet, ou null s'il n'a aucun dépôt lié. Lève si le lien
 * est incomplet (installation_id GitHub manquant) ou si le provider est inconnu.
 */
export async function resolveRepoCloneTarget(
  projectId: string,
  access: RepoTokenAccess = "full",
): Promise<RepoCloneTarget | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("project_git_links")
    .select(GIT_LINK_COLUMNS)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!data) return null;
  return targetFromLink(data as GitLinkRow, access);
}

/**
 * Cible de clone d'un DÉPÔT, pour un utilisateur donné (MIN-143).
 *
 * Une pull request n'appartient pas à un projet : elle appartient à un dépôt,
 * que plusieurs projets peuvent lier. Il faut donc choisir un lien — et pas
 * n'importe lequel : un lien dont le projet est ACCESSIBLE À CET UTILISATEUR.
 * Sans ce filtre, on minterait un token au nom d'un projet qu'il ne peut pas
 * voir : le membre d'un projet suffirait à agir sur un dépôt lié ailleurs.
 *
 * Renvoie null quand aucun projet accessible ne lie ce dépôt — l'appelant en
 * fait un 404, comme partout ailleurs.
 */
export async function resolveRepoCloneTargetForRepo(opts: {
  userId: string;
  provider: RepoProvider;
  repoFullName: string;
}): Promise<RepoCloneTarget | null> {
  const link = await resolveProjectLinkForRepo(opts);
  return link ? targetFromLink(link.row) : null;
}

/** Liaison projet↔dépôt retenue pour un utilisateur, SANS mint de token. */
export interface ResolvedRepoLink {
  linkId: string;
  connectionId: string;
  projectId: string;
  provider: RepoProvider;
  repoFullName: string;
  defaultBranch: string;
  /** Ligne brute, pour `targetFromLink` — évite une seconde requête. */
  row: GitLinkRow;
}

/**
 * La liaison projet↔dépôt par laquelle CET utilisateur atteint ce dépôt, sans
 * minter de token (MIN-168) : le lancement d'une review a besoin du PROJET
 * porteur du run — c'est lui que la RLS des runs interroge — bien avant d'avoir
 * besoin de parler à la forge.
 *
 * Même règle de choix que `resolveRepoCloneTargetForRepo`, dont c'est désormais
 * la première moitié : le premier lien dont le projet est ACCESSIBLE. Sans ce
 * filtre, un membre d'un projet quelconque agirait sur un dépôt lié ailleurs.
 */
export async function resolveProjectLinkForRepo(opts: {
  userId: string;
  provider: RepoProvider;
  repoFullName: string;
}): Promise<ResolvedRepoLink | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("project_git_links")
    .select(`${GIT_LINK_COLUMNS}, project_id`)
    .eq("provider", opts.provider)
    .eq("repo_full_name", opts.repoFullName);

  const rows = (data ?? []) as GitLinkRow[];
  for (const row of rows) {
    if (!row.project_id || !row.repo_full_name) continue;
    const access = await getProjectAccess(opts.userId, row.project_id);
    if (!access) continue;
    return {
      linkId: row.id,
      connectionId: row.connection_id,
      projectId: row.project_id,
      provider: opts.provider,
      repoFullName: row.repo_full_name,
      defaultBranch: row.default_branch ?? "main",
      row,
    };
  }
  return null;
}

/**
 * Mint du token + URL de clone pour une ligne `project_git_links` déjà résolue.
 *
 * **C'est ici que se décide QUI agit sur la forge** — et il n'y a que deux
 * porteurs possibles dans minddy :
 *
 * - **L'agent, c'est minddy.** Ce que fait Numo (ouvrir la MR, pousser la
 *   branche, poser les commentaires de sa review, faire le ménage des branches)
 *   doit porter le nom de minddy, jamais celui d'un humain. C'est le token minté
 *   ici. Sur GitHub, le token d'installation donne `minddy-app[bot]` : juste.
 * - **Un geste humain porte le nom de l'humain** (MIN-144) : approuver,
 *   commenter, réagir, merger passent par `resolveForgeActor`
 *   ([lib/server/git/forge-actor.ts](lib/server/git/forge-actor.ts)) et le token
 *   du compte git de qui clique. Jamais par le token d'ici.
 *
 * **La transgression connue (MIN-146).** GitLab n'a aucune identité de bot : le
 * token ci-dessous est l'access token OAuth de la connexion portée par le LIEN,
 * c'est-à-dire du compte de la personne qui a lié le dépôt. Sur la forge, c'est
 * donc elle qui ouvre la MR de Numo et qui poste ses commentaires — un geste
 * automatisé sous un nom humain, le miroir exact du bug corrigé par MIN-144.
 * Les COMMITS, eux, sont corrects (`resolveCommitterIdentity` dans execute.ts
 * configure `minddy agent <agent@minddy.app>`) : c'est l'auteur au niveau de
 * l'API qui est faux. En attendant une identité de service GitLab, la liaison
 * le dit dans l'UI (`gitAgentActsAs`) plutôt que de le taire.
 */
async function targetFromLink(
  row: GitLinkRow,
  access: RepoTokenAccess = "full",
): Promise<RepoCloneTarget> {
  if (!row.repo_full_name) {
    throw new Error("Project git link is missing repo_full_name");
  }

  if (row.provider === "github") {
    if (row.installation_id == null) {
      throw new Error("GitHub link is missing its installation id");
    }
    /**
     * LA PORTÉE PAR DÉPÔT EST POSÉE DANS TOUS LES CAS (MIN-327), profil compris.
     *
     * Le nom COURT, pas `owner/name` : c'est ce que `repositories` attend, et un
     * slash y vaut 422. On le tient du lien lui-même — le projet a lié un dépôt,
     * il n'y a rien à deviner.
     */
    const repoName = row.repo_full_name.split("/").pop() ?? row.repo_full_name;
    const { token } = await getInstallationToken(row.installation_id, {
      repositories: [repoName],
      permissions: GITHUB_PERMISSIONS_BY_ACCESS[access],
    });
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
