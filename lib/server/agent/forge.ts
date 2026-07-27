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
} from "./pr";

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

/**
 * Surface commune des opérations PR/MR. Volontairement PLUS ÉTROITE que les
 * modules concrets : pas de `commitId` (chaque provider résout sa propre ancre
 * de review), pas de méthode de merge ni de commentaire multi-lignes (options
 * GitHub que GitLab ignorerait en silence), pas de `findOpen*` (détail interne
 * des `ensure*`). N'élargir qu'avec une implémentation réelle des deux côtés.
 */
export interface Forge {
  provider: RepoProviderId;
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
