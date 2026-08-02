import "server-only";

import type { SyncableIssueStatus } from "@/lib/pr-issue-status";
import { resolveRepoCloneTargetForRepo } from "./repo-access";
import { parsePullRequestRef } from "./pr-ingest-core";
import { broadcastPrChanged } from "./pr-live";
import { issueStatusForPrState, syncIssueStatusFromPr } from "./issue-status-sync";
import {
  findPullRequestByNumber,
  hasLivePullRequest,
  projectsForRepo,
  repoForProject,
  rowProvider,
  setPullRequestIssue,
  syncRepoPullRequests,
  type PullRequestRow,
} from "./pull-requests";

/**
 * Rattacher À LA MAIN une pull request à un ticket — la RÈGLE, une fois, pour
 * les trois surfaces qui la portent (MIN-163) : le dialog de l'app (route
 * `pull-requests/[prId]`), le MCP (`minddy_link_pull_request`) et Numo
 * (`link_pull_request`).
 *
 * Elle vivait dans le handler HTTP, c'est-à-dire nulle part de réutilisable : la
 * réécrire pour chaque agent, c'est se donner trois versions d'un refus qui doit
 * être le même. Ce qui reste à l'appelant, et ne peut pas en descendre, c'est
 * l'ACCÈS : chaque surface a son propre garde (RLS du client authentifié pour
 * l'app, `requireProject` pour le MCP, `assertIssueInProject` pour Numo). Le
 * cœur reçoit donc un ticket DÉJÀ autorisé, et ne juge que le rattachement.
 *
 * Le sens est UNIQUE, comme `setPullRequestIssue` : on lie, on ne délie pas. Le
 * lien est définitif côté produit, et un détachement serait de toute façon
 * rétabli au prochain balayage si la branche porte encore la référence.
 */

export type PrLinkRefusal =
  /** La PR porte DÉJÀ un autre ticket — un lien ne se remplace pas. */
  | "pr_already_linked"
  /** Le ticket porte déjà une PR VIVANTE (brouillon ou ouverte). */
  | "issue_already_linked"
  /** Le projet du ticket ne lie pas le dépôt de cette PR. */
  | "issue_outside_repo";

export type PrLinkResult =
  | {
      ok: true;
      /** Vrai quand la PR pointait DÉJÀ ce ticket : rien n'a été écrit. */
      already: boolean;
      /**
       * Statut où le rattachement a posé le ticket. `null` reste dans le type
       * (`issueStatusForPrState` le rend sur un état inconnu) mais pas dans les
       * faits : les quatre états d'une ligne `pull_requests` impliquent tous un
       * statut.
       */
      status: SyncableIssueStatus | null;
    }
  | { ok: false; code: PrLinkRefusal };

/**
 * Pose le lien, ou dit pourquoi il ne se pose pas.
 *
 * Le déjà-lié se sépare en DEUX cas, parce qu'ils ne veulent pas dire la même
 * chose : la même PR sur le même ticket, c'est le geste déjà fait (`already`) —
 * un agent qui rejoue son appel doit trouver un succès, pas une erreur ; la
 * même PR sur un AUTRE ticket, c'est un vrai conflit.
 */
export async function linkPullRequestToIssue(opts: {
  pr: PullRequestRow;
  /** Ticket déjà autorisé par l'appelant (existant, visible, pas à la corbeille). */
  issue: { id: string; projectId: string };
  actorId: string;
}): Promise<PrLinkResult> {
  const { pr, issue, actorId } = opts;
  const status = issueStatusForPrState(pr.state);

  if (pr.issue_id === issue.id) return { ok: true, already: true, status };
  if (pr.issue_id) return { ok: false, code: "pr_already_linked" };

  // Le périmètre exact de la voie conventionnelle (`resolveIssueForPr`) : un
  // ticket ne se rattache qu'à une PR d'un dépôt que son projet lie.
  const projects = await projectsForRepo(rowProvider(pr), pr.repo_full_name);
  if (!projects.some((p) => p.id === issue.projectId)) {
    return { ok: false, code: "issue_outside_repo" };
  }

  if (await hasLivePullRequest(issue.id)) {
    return { ok: false, code: "issue_already_linked" };
  }

  // C'est la BASE qui tranche : `false` = la PR a été rattachée entre-temps.
  if (!(await setPullRequestIssue(pr.id, issue.id))) {
    return { ok: false, code: "pr_already_linked" };
  }

  // La liste et le panneau du ticket passent par le trigger de diffusion
  // (`issue_id` est une des colonnes qui diffusent) ; le panneau OUVERT sur la
  // PR, lui, montre le ticket dans un en-tête servi par la forge.
  broadcastPrChanged(pr.id, ["pr"]);
  await syncIssueStatusFromPr({ issueId: issue.id, actorId, prState: pr.state });

  return { ok: true, already: false, status };
}

export type PrResolveFailure =
  /** La référence donnée n'est pas un numéro / une URL de pull request. */
  | "invalid_ref"
  /** Le projet n'a pas de dépôt lié — il n'y a aucune PR à désigner. */
  | "no_repository"
  /** Le dépôt est lié, mais il n'a pas de PR portant ce numéro. */
  | "not_found";

/**
 * La pull request qu'un utilisateur DÉSIGNE dans un projet : « la #42 », ou
 * l'URL qu'il a copiée. C'est l'entrée des agents, qui n'ont pas d'id minddy de
 * PR sous la main — l'app, elle, en part toujours.
 *
 * Le RATTRAPAGE compte ici plus qu'ailleurs. `pull_requests` est peuplée par les
 * webhooks et par le balayage périodique : une PR ouverte il y a trente secondes
 * sur un dépôt sans webhook déployé n'y est simplement pas encore, et répondre
 * « introuvable » sur une PR que l'utilisateur a sous les yeux ferait passer
 * l'outil pour cassé. On balaye donc le dépôt UNE fois sur un manque, puis on
 * relit. Le balayage reste best-effort : forge en panne = « introuvable », pas
 * une erreur qui remonte.
 */
export async function resolveProjectPullRequest(opts: {
  projectId: string;
  /** Numéro, `#42`, `!42` (MR GitLab), ou URL de la forge. */
  ref: string | number | null | undefined;
  /** Utilisateur au nom duquel le rattrapage lit la forge. */
  userId: string;
}): Promise<{ pr: PullRequestRow } | { error: PrResolveFailure }> {
  const number = parsePullRequestRef(opts.ref);
  if (number == null) return { error: "invalid_ref" };

  const repo = await repoForProject(opts.projectId);
  if (!repo) return { error: "no_repository" };

  const existing = await findPullRequestByNumber({ ...repo, number });
  if (existing) return { pr: existing };

  try {
    const target = await resolveRepoCloneTargetForRepo({
      userId: opts.userId,
      provider: repo.provider,
      repoFullName: repo.repoFullName,
    });
    if (target) {
      await syncRepoPullRequests({ ...repo, token: target.token });
    }
  } catch (err) {
    console.error("[pr-link] sweep failed:", (err as Error).message);
  }

  const swept = await findPullRequestByNumber({ ...repo, number });
  return swept ? { pr: swept } : { error: "not_found" };
}
