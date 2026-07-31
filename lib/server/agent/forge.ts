import "server-only";

import type { RepoProviderId } from "@/lib/repo-providers";
import * as github from "./pr";
import * as gitlab from "./mr";
import { GithubApiError } from "./pr";
import { GitlabApiError } from "./mr";
import type {
  PullRequestRef,
  PullRequestFile,
  PullRequestComment,
  PullRequestReviewComment,
  PullRequestReviewSummary,
  ReviewSubmission,
  ReviewVerdict,
} from "./pr";
import type { ChecksSummary } from "./checks-core";

/**
 * Abstraction provider des opérations PR/MR de l'agent (MIN-69). Chaque provider
 * expose la MÊME surface (les signatures de `pr.ts`, types neutres compris) ; les
 * appelants résolvent le client via `forgeFor(target.provider)` au lieu d'importer
 * `pr.ts` en direct. « PR » reste le vocabulaire neutre côté code — une merge
 * request GitLab est présentée sous les mêmes types (numéro = `iid`).
 *
 * Les modules concrets gardent chacun leur classe d'erreur (`GithubApiError` /
 * `GitlabApiError`, toutes deux porteuses d'un `status` HTTP) : `isForgeApiError`
 * est le test commun des routes. Pas de classe mère partagée — elle créerait un
 * cycle d'import (forge → pr → forge) piégeux à l'évaluation des modules.
 */

/** Erreur d'API provider (GitHub ou GitLab), toujours porteuse du status HTTP. */
export type ForgeApiError = GithubApiError | GitlabApiError;

export function isForgeApiError(err: unknown): err is ForgeApiError {
  return err instanceof GithubApiError || err instanceof GitlabApiError;
}

/** Méthodes de merge offertes par une forge (MIN-138). */
export type MergeMethod = "merge" | "squash" | "rebase";

/**
 * Surface commune des opérations PR/MR. Volontairement PLUS ÉTROITE que les
 * modules concrets : pas de `commitId` (chaque provider résout sa propre ancre
 * de review), pas de commentaire multi-lignes (option GitHub que GitLab
 * ignorerait en silence), pas de `findOpen*` (détail interne des `ensure*`).
 * N'élargir qu'avec une implémentation réelle des deux côtés.
 *
 * La méthode de merge, elle, a rejoint la surface (MIN-138) : elle a désormais
 * une implémentation réelle des deux côtés — mais pas le même MENU, d'où
 * `mergeMethods`, que l'UI lit pour ne proposer que ce que la forge sait faire.
 */
export interface Forge {
  provider: RepoProviderId;
  /** Méthodes de merge réellement offertes — GitLab fixe sa stratégie au niveau
      du projet, seul `squash` y est un paramètre de l'appel merge. */
  mergeMethods: readonly MergeMethod[];
  /** Noms des branches du dépôt (picker de branche de base au lancement). */
  listBranches(opts: { token: string; repoFullName: string }): Promise<string[]>;
  /** TOUTES les PR/MR du dépôt, tous états — le ménage des branches d'agent
      (MIN-102) a besoin des fermées pour choisir ET des ouvertes pour protéger.
      `truncated` : la pagination a été coupée, la liste n'est pas exhaustive. */
  listPullRequests(opts: {
    token: string;
    repoFullName: string;
  }): Promise<{ pulls: PullRequestRef[]; truncated: boolean }>;
  /** Supprime une branche distante. `"already-gone"` (et non une erreur) quand
      la référence n'existe déjà plus : rejouer un ménage n'est pas une panne. */
  deleteBranch(opts: {
    token: string;
    repoFullName: string;
    branch: string;
  }): Promise<"deleted" | "already-gone">;
  ensurePullRequest(opts: {
    token: string;
    repoFullName: string;
    head: string;
    base: string;
    title: string;
    body: string;
  }): Promise<PullRequestRef>;
  getPullRequest(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<PullRequestRef>;
  listPullRequestFiles(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<PullRequestFile[]>;
  /** Diff CUMULÉ de la branche de travail contre sa base — la vue diff d'une
      session SANS PR (mêmes fichiers/patches que listPullRequestFiles, depuis le
      merge base). 404 provider si la branche n'a pas (encore) été poussée.
      `url` : la page compare web du provider (liens « voir sur … »). */
  compareBranches(opts: {
    token: string;
    repoFullName: string;
    base: string;
    head: string;
  }): Promise<{ files: PullRequestFile[]; url: string | null }>;
  /** Merge base de deux BRANCHES — le pendant sans PR de getMergeBaseSha, base
      du dépliage de contexte de la vue diff d'une session sans PR. */
  getBranchesMergeBaseSha(opts: {
    token: string;
    repoFullName: string;
    base: string;
    head: string;
  }): Promise<string>;
  /** Base du diff servi : merge base VIVANT (GitHub, diff recalculé à la volée)
      ou `diff_refs.base_sha` PERSISTÉ (GitLab, diff figé au dernier push). */
  getMergeBaseSha(opts: {
    token: string;
    repoFullName: string;
    number: number;
    base: string;
    head: string;
  }): Promise<string>;
  getFileAtRef(opts: {
    token: string;
    repoFullName: string;
    path: string;
    ref: string;
  }): Promise<string | null>;
  mergePullRequest(opts: {
    token: string;
    repoFullName: string;
    number: number;
    /** Doit appartenir à `mergeMethods` — l'appelant valide, la forge n'invente pas. */
    method?: MergeMethod;
  }): Promise<void>;
  /**
   * Soumet une review formelle. `published: "comment"` en retour = la forge a
   * refusé de publier le verdict (auto-review) et il est parti en commentaire :
   * l'appelant doit le dire à l'utilisateur, et enregistrer le verdict RÉEL de
   * son côté. C'est le cas normal des PR de Numo, pas un cas dégradé.
   */
  submitReview(opts: {
    token: string;
    repoFullName: string;
    number: number;
    verdict: ReviewVerdict;
    body: string;
  }): Promise<ReviewSubmission>;
  /** Décompte d'approbations, déjà réduit : la règle « dernier verdict par
      utilisateur » est un détail GitHub (GitLab tient la liste courante), elle
      n'a pas à remonter jusqu'aux appelants. */
  listReviews(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<PullRequestReviewSummary>;
  /** Checks CI. `number` ET `sha` sont demandés parce que les deux forges
      n'adressent pas la même chose : GitHub interroge le COMMIT de tête, GitLab
      les pipelines de la MR. Chaque implémentation ignore le champ qu'elle
      n'utilise pas (même arrangement que `getBranchesMergeBaseSha`). */
  listChecks(opts: {
    token: string;
    repoFullName: string;
    number: number;
    sha: string;
  }): Promise<ChecksSummary>;
  /** Brouillon → prêt pour la review. `nodeId` n'est lu que par GitHub (clé de
      la mutation GraphQL) ; GitLab retire le préfixe `Draft:` du titre. */
  markReadyForReview(opts: {
    token: string;
    repoFullName: string;
    number: number;
    nodeId?: string;
  }): Promise<void>;
  closePullRequest(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<void>;
  reopenPullRequest(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<PullRequestRef>;
  listPullRequestComments(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<PullRequestComment[]>;
  createPullRequestComment(opts: {
    token: string;
    repoFullName: string;
    number: number;
    body: string;
  }): Promise<PullRequestComment>;
  listPullRequestReviewComments(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<PullRequestReviewComment[]>;
  /** Ancre résolue PAR le provider : tête de PR relue à chaud (GitHub) ou
      diff_refs (GitLab). Ligne hors diff → erreur 422 (« lineNotInDiff »). */
  createPullRequestReviewComment(opts: {
    token: string;
    repoFullName: string;
    number: number;
    body: string;
    path: string;
    line: number;
    side: "LEFT" | "RIGHT";
  }): Promise<PullRequestReviewComment>;
  replyToPullRequestReviewComment(opts: {
    token: string;
    repoFullName: string;
    number: number;
    commentId: number;
    body: string;
  }): Promise<PullRequestReviewComment>;
}

const githubForge: Forge = {
  provider: "github",
  mergeMethods: ["squash", "merge", "rebase"],
  listBranches: github.listBranches,
  listPullRequests: github.listPullRequests,
  deleteBranch: github.deleteBranch,
  ensurePullRequest: github.ensurePullRequest,
  getPullRequest: github.getPullRequest,
  listPullRequestFiles: github.listPullRequestFiles,
  compareBranches: github.compareBranches,
  // Le compare GitHub est déjà branche-à-branche : la même fonction sert les
  // deux surfaces (le `number` de l'interface n'y est pas utilisé).
  getBranchesMergeBaseSha: github.getMergeBaseSha,
  getMergeBaseSha: github.getMergeBaseSha,
  getFileAtRef: github.getFileAtRef,
  mergePullRequest: github.mergePullRequest,
  submitReview: github.submitPullRequestReview,
  listReviews: github.listPullRequestReviews,
  listChecks: github.listPullRequestChecks,
  // La mutation GraphQL n'adresse la PR que par son `node_id` : sans lui (une PR
  // lue par l'endpoint *list*, qui ne le sert pas), on refuse net plutôt que de
  // laisser GitHub répondre une erreur GraphQL opaque.
  markReadyForReview: async (opts) => {
    if (!opts.nodeId) {
      throw new GithubApiError("Pull request has no GraphQL id", 409);
    }
    return github.markPullRequestReadyForReview({ token: opts.token, nodeId: opts.nodeId });
  },
  closePullRequest: github.closePullRequest,
  reopenPullRequest: github.reopenPullRequest,
  listPullRequestComments: github.listPullRequestComments,
  createPullRequestComment: github.createPullRequestComment,
  listPullRequestReviewComments: github.listPullRequestReviewComments,
  // GitHub exige `commit_id` = la TÊTE de la PR, relue à chaud à chaque envoi
  // (entre l'ouverture de la vue et l'envoi, l'agent a pu pousser — cf. pr.ts).
  createPullRequestReviewComment: async (opts) => {
    const pr = await github.getPullRequest({
      token: opts.token,
      repoFullName: opts.repoFullName,
      number: opts.number,
    });
    if (!pr.headSha) {
      throw new GithubApiError("Pull request has no head commit", 409);
    }
    return github.createPullRequestReviewComment({ ...opts, commitId: pr.headSha });
  },
  replyToPullRequestReviewComment: github.replyToPullRequestReviewComment,
};

const gitlabForge: Forge = {
  provider: "gitlab",
  // Pas de `rebase` : GitLab règle la stratégie au niveau du projet, seul le
  // squash est un paramètre de l'appel merge.
  mergeMethods: ["squash", "merge"],
  listBranches: gitlab.listBranches,
  listPullRequests: gitlab.listPullRequests,
  deleteBranch: gitlab.deleteBranch,
  ensurePullRequest: gitlab.ensureMergeRequest,
  getPullRequest: gitlab.getMergeRequest,
  listPullRequestFiles: gitlab.listMergeRequestChanges,
  compareBranches: gitlab.compareBranches,
  getBranchesMergeBaseSha: gitlab.getBranchesMergeBaseSha,
  getMergeBaseSha: gitlab.getMergeBaseSha,
  getFileAtRef: gitlab.getFileAtRef,
  mergePullRequest: gitlab.mergeMergeRequest,
  submitReview: gitlab.submitMergeRequestReview,
  listReviews: gitlab.listMergeRequestApprovals,
  listChecks: gitlab.listMergeRequestChecks,
  markReadyForReview: gitlab.markMergeRequestReadyForReview,
  closePullRequest: gitlab.closeMergeRequest,
  reopenPullRequest: gitlab.reopenMergeRequest,
  listPullRequestComments: gitlab.listMergeRequestNotes,
  createPullRequestComment: gitlab.createMergeRequestNote,
  listPullRequestReviewComments: gitlab.listMergeRequestDiffComments,
  createPullRequestReviewComment: gitlab.createMergeRequestDiffComment,
  replyToPullRequestReviewComment: gitlab.replyToMergeRequestDiffComment,
};

/** Client du provider — la valeur vient de `RepoCloneTarget.provider` (DB). */
export function forgeFor(provider: RepoProviderId): Forge {
  return provider === "gitlab" ? gitlabForge : githubForge;
}
