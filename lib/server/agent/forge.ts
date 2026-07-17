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

/** Surface commune des opérations PR/MR — les signatures exactes de `pr.ts`. */
export interface Forge {
  provider: RepoProviderId;
  findOpenPullRequest(opts: {
    token: string;
    repoFullName: string;
    head: string;
  }): Promise<PullRequestRef | null>;
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
  getMergeBaseSha(opts: {
    token: string;
    repoFullName: string;
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
    method?: "merge" | "squash" | "rebase";
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
  createPullRequestReviewComment(opts: {
    token: string;
    repoFullName: string;
    number: number;
    body: string;
    commitId: string;
    path: string;
    line: number;
    side: "LEFT" | "RIGHT";
    startLine?: number;
    startSide?: "LEFT" | "RIGHT";
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
  findOpenPullRequest: github.findOpenPullRequest,
  ensurePullRequest: github.ensurePullRequest,
  getPullRequest: github.getPullRequest,
  listPullRequestFiles: github.listPullRequestFiles,
  getMergeBaseSha: github.getMergeBaseSha,
  getFileAtRef: github.getFileAtRef,
  mergePullRequest: github.mergePullRequest,
  closePullRequest: github.closePullRequest,
  reopenPullRequest: github.reopenPullRequest,
  listPullRequestComments: github.listPullRequestComments,
  createPullRequestComment: github.createPullRequestComment,
  listPullRequestReviewComments: github.listPullRequestReviewComments,
  createPullRequestReviewComment: github.createPullRequestReviewComment,
  replyToPullRequestReviewComment: github.replyToPullRequestReviewComment,
};

const gitlabForge: Forge = {
  provider: "gitlab",
  findOpenPullRequest: gitlab.findOpenMergeRequest,
  ensurePullRequest: gitlab.ensureMergeRequest,
  getPullRequest: gitlab.getMergeRequest,
  listPullRequestFiles: gitlab.listMergeRequestChanges,
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
