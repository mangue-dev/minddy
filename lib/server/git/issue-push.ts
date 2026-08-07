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
 * Le RETOUR de la synchro d'issues : le statut d'un ticket minddy referme ou
 * rouvre l'issue dont il vient.
 *
 * MIN-97 posait un « sens unique STRICT : rien ici n'écrit chez le provider ».
 * Ce module lève cette règle sur UN champ, et sur un seul : l'état ouvert /
 * fermé. Ni le titre, ni le corps, ni les labels, ni les assignés ne remontent
 * — la forge reste la source de ceux-là (cf. `applyRemoteIssue`), et un
 * aller-retour à deux sens sur les mêmes champs n'aurait pas de gagnant.
 *
 * Pourquoi l'état, lui, mérite les deux sens : une issue ouverte sur le dépôt
 * alors que le projet minddy existe sera vraisemblablement traitée sur le
 * dépôt. Mais celui qui la termine peut très bien le dire dans minddy — et
 * laisser derrière lui une issue GitHub ouverte que plus personne ne referme.
 *
 * **La boucle ne se referme pas**, et c'est voulu à trois endroits :
 *  1. `updateIssueFields` n'appelle ceci QUE si l'écriture ne vient pas de la
 *     forge (`forgeSync` nul) — un statut descendu du webhook ne remonte pas ;
 *  2. l'écho que GitHub renvoie (`issues.closed`) retrouve un ticket DÉJÀ dans
 *     l'état voulu, donc `applyRemoteIssue` ne patche rien ;
 *  3. on ne pousse que si l'état distant CHANGE — un `done` → `canceled` reste
 *     `closed` des deux côtés et ne fait aucun appel.
 *
 * **Qui signe.** Le geste est HUMAIN : quelqu'un a déplacé une carte. Donc le
 * compte git de cette personne d'abord (`resolveForgeActor`, comme les gestes
 * sur une pull request), et l'App / la connexion du lien seulement à défaut.
 * GitHub affiche alors « minddy a fermé » — approximation assumée, la même
 * qu'en MIN-146 côté GitLab : sans elle, la synchro décrocherait en silence
 * pour tous ceux qui n'ont pas connecté de compte, ce qui est pire.
 *
 * Best-effort et hors chemin critique (`afterOrNow`) : une forge en panne ne
 * doit jamais faire échouer le déplacement d'une carte.
 */

/** Ce qu'une liaison doit fournir pour qu'on puisse écrire chez la forge. */
interface PushTarget {
  provider: RepoProviderId;
  connectionId: string;
  installationId: number | null;
  repoFullName: string | null;
  externalRepoId: string;
}

/** Le ticket qu'on pousse — l'identité distante qu'il porte déjà. */
export interface RemoteIssueIdentity {
  projectId: string;
  provider: string | null;
  repoId: string | null;
  number: number | null;
}

/**
 * Programme la répercussion d'un changement de statut chez la forge. No-op
 * silencieux pour un ticket né dans minddy (la quasi-totalité) : la garde est
 * une comparaison de champs déjà chargés, aucune requête.
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
    // Couper la synchro coupe les DEUX sens : le toggle est le seul
    // interrupteur, et il serait incompréhensible qu'il n'en arrête qu'un.
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
 * Le token qui écrira : celui de l'acteur s'il a connecté son compte ET peut
 * écrire sur le dépôt, sinon celui de la liaison (l'App GitHub, la connexion
 * OAuth du lieur côté GitLab).
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
    // `read` ne suffit pas pour fermer une issue : on retombe sur l'App plutôt
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
 * `PATCH /repos/{repo}/issues/{n}`. `state_reason` distingue les deux façons de
 * fermer que GitHub affiche différemment (coche violette « completed » contre
 * cercle gris « not planned ») — c'est la seule nuance de nos trois statuts
 * clos qui survive à la traversée.
 *
 * Demande la permission `Issues: Write` de la GitHub App. Une App qui gagne une
 * permission ne l'obtient PAS rétroactivement : chaque installation existante
 * doit l'accepter (même piège que `getIssuesPermission`). Tant que ce n'est pas
 * fait, GitHub répond **403 « Resource not accessible by integration »** — le
 * geste est journalisé et abandonné, le ticket reste déplacé dans minddy.
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
 * `PUT /projects/{id}/issues/{iid}`. GitLab ne prend pas un état mais une
 * TRANSITION (`state_event: close | reopen`), et n'a pas d'équivalent de
 * `state_reason` : les trois statuts clos de minddy y ferment pareil.
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
