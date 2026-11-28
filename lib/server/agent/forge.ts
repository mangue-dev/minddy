import "server-only";

import type { RepoProviderId } from "@/lib/repo-providers";
import { getGithubAppSlug } from "@/lib/server/git/github-app";
import { isGithubUserAuthConfigured } from "@/lib/server/git/github-user-auth";
import { isGitlabConfigured } from "@/lib/server/git/gitlab-app";
import * as github from "./pr";
import * as gitlab from "./mr";
import { GithubApiError } from "./pr";
import type { CommitDiff, CommitExtras, DeploymentOutcome, ReviewSubmission } from "./pr";
import type { PrTimelineEvent } from "@/lib/pr-timeline";
import type { ReviewThreadState } from "@/lib/pr-review-threads";
import type { ReviewCommentReaction, ReviewReactionContent } from "@/lib/pr-review-reactions";
import {
  mirrorFromGithubConversationComment,
  mirrorFromGithubReview,
  mirrorFromGithubReviewComment,
  mirrorFromGitlabNote,
  type PrCommentMirror,
} from "@/lib/pr-comment-mirror";
import type { MergeMethod, RepositoryMergePolicy } from "@/lib/pr-readiness";
import type {
  ChecksSummary,
  CheckRerunRef,
  PullRequestComment,
  PullRequestCommit,
  PullRequestFile,
  PullRequestRef,
  PullRequestReviewComment,
  PullRequestReviewSummary,
  RepoMember,
  ReviewVerdict,
} from "@/lib/pull-request-contract";

export { ForgeApiError, isForgeApiError } from "./forge-error";

/**
 * Provider abstraction of PR/MR operations (MIN-69). Each provider exposes the
 * same surface; callers resolve the client with `forgeFor(target.provider)`
 * instead of importing `pr.ts` or `mr.ts`. "PR" remains the neutral vocabulary
 * on the code side: a GitLab merge request uses the same types (number = `iid`).
 */

/**
 * Common surface for PR/MR operations. Deliberately narrower than the
 * concrete modules: no `commitId` (each provider resolves its own review
 * anchor). Expand only with a real implementation on both sides.
 *
 * The merge method has joined the surface (MIN-138): it now has
 * a real implementation on both sides — but not the same MENU, hence
 * `mergeMethods`, which the UI reads to only offer what the forge knows how to do.
 *
 * ## Who signs what (MIN-144, MIN-145)
 *
 * **A human gesture bears the name of the human, an automated gesture by minddy
 * bears the name of minddy.** The forge does not decide: it writes under the `token`
 * which is passed to it. It is therefore the CALLER who carries the rule, and this table says
 * which of the two identities each gesture must give him — the safeguard which
 * was missing when the emoji reaction remained for a year on the wrong account.
 *
 * | Gesture | Identity | Bearer |
 * | --- | --- | --- |
 * | `mergePullRequest`, `closePullRequest`, `reopenPullRequest`, `markReadyForReview`, `convertToDraft` from the PR page | human | `actorCall` |
 * | `mergePullRequest`, `updatePullRequestTitle`/`Body`, comments from Numo (`pull-request-writes.ts`) | minddy | installation token |
 * | `submitReview` (the person's verdict) | human | `actorCall` |
 * | `createPullRequestComment`, `updatePullRequestComment`, `createPullRequestReviewComment`, `replyToPullRequestReviewComment` from UI PR | human | `actorCall` |
 * | `setReviewThreadResolved` | human or minddy | `actorCall` from the PR page; installation token from Numo |
 * | `setReviewCommentReaction`, `setConversationReaction` | human | `actorCall` + `login` |
 *
 * The comment methods serve both identities: the gesture decides, not the
 * method. Numo writes under the bot; the same method, called from the PR
 * panel, uses the person's account.
 *
 * `setReviewThreadResolved` is two-faced the same way: resolving from the
 * PR page is the human's gesture and carries their name, while Numo closes a
 * conversation under minddy's account (`pull-request-writes.ts`), so a reader
 * can tell a machine's closure from a person's.
 *
 * READS all remain on the installation token: any member
 * of the minddy project must see the PR without a connected git account. The only exception
 * is `listReviewCommentReactions`, the outcome of which depends on who is looking.
 */
/** How people and minddy itself appear on a forge (MIN-144, MIN-146). */
export interface ForgeIdentity {
  /** Where a member's own account on this forge is stored: the GitHub user
      authorization, or the GitLab connection, which is also the account that
      links repositories. */
  accountTable: "git_user_identities" | "git_connections";
  /** Members can connect their own account on this deployment. */
  userAuthConfigured(): boolean;
  /** minddy's own login on the forge, or null. GitLab has no free bot
      identity: Numo's gestures there carry the linking account (MIN-146). */
  botLogin(): string | null;
}

export interface Forge {
  provider: RepoProviderId;
  /** Merge methods actually offered — GitLab sets its strategy at the
 level of the project, only `squash` is a parameter of the merge call. */
  mergeMethods: readonly MergeMethod[];
  /** The forge reads reactions comment by comment (GitLab), so a caller must
      know the comment ids first; GitHub reads them for the whole PR at once. */
  reactionsNeedCommentIds: boolean;
  /** Identical concurrent display reads can share one in-flight request
      (`withGithubReadScope`). Only the GitHub HTTP layer does it. */
  sharesConcurrentReads: boolean;
  identity: ForgeIdentity;
  /** Request a review using the connected human account, preserving other requests. */
  requestPullRequestReviewer(opts: { token: string; repoFullName: string; number: number; login: string }): Promise<void>;
  /**
 * The FORGE accounts that can be mentioned on this repository (MIN-162) — not
 * minddy members: a `@` in a PR comment ends up at the forge,
 * where it only notifies if it's an account from there.
 *
 * Collaborators (`affiliation=all`) on the GitHub side, members of the project AND of the
 * parent group (`members/all`) on the GitLab side: in both cases, what the
 * forge itself offers under an at sign.
 */
  listRepoMembers(opts: { token: string; repoFullName: string }): Promise<RepoMember[]>;
  /** The repository's PR/MRs, all states by default (the sweep needs merged
 and closed ones), or open ones only (the review queue). `truncated`:
 pagination has been cut, the list is not exhaustive. */
  listPullRequests(opts: {
    token: string;
    repoFullName: string;
    includeReviewRequests?: boolean;
    /** `open` reads only the live PRs; `all` by default. */
    state?: "open" | "all";
    /** Only the PRs updated since this instant (an incremental sweep). */
    updatedSince?: string;
  }): Promise<{ pulls: PullRequestRef[]; truncated: boolean }>;
  getPullRequest(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<PullRequestRef>;
  /** Repository/project merge settings and base-branch protection rules. */
  getRepositoryMergePolicy(opts: {
    token: string;
    repoFullName: string;
    number: number;
    base: string;
  }): Promise<RepositoryMergePolicy>;
  /** Diff files, with their patches. PAGINED and BOUNDED (MIN-168):
 `truncated` says that the list stops at the ceiling - a PR of 300 files
 of which 100 were only shown without saying it led to the conclusion that it was a third of the
 change. */
  listPullRequestFiles(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<{ files: PullRequestFile[]; truncated: boolean }>;
  /** The commits that make up the PR, from the OLDEST to the most recent (the order of
 GitHub, standardized on the GitLab side). `truncated`: the pagination has been cut —
 the list stops at the first 300, the rest can be read at the forge.
 The fields that the forge cannot fill are worth `null` (account of
 the author and signature on the GitLab side), never an invented value. */
  listPullRequestCommits(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<{ commits: PullRequestCommit[]; truncated: boolean }>;
  /** The commits `head` has and `base` does not, oldest first (MIN-1037):
      what a push brought when its payload was cut, and what the default
      branch gained since the last sweep. Both are commit SHAs or branch names. */
  compareCommits(opts: {
    token: string;
    repoFullName: string;
    base: string;
    head: string;
  }): Promise<{ commits: PullRequestCommit[]; truncated: boolean }>;
  /** SHA at the tip of a branch, or null when the branch does not exist. */
  getBranchHeadSha(opts: {
    token: string;
    repoFullName: string;
    branch: string;
  }): Promise<string | null>;
  /** Numbers of the pull requests a commit belongs to (MIN-1037): the one
      whose merge brought it to the default branch, whatever the merge method. */
  listCommitPullRequestNumbers(opts: {
    token: string;
    repoFullName: string;
    sha: string;
  }): Promise<number[]>;
  /** The weight (+/− lines) of each commit, indexed by SHA — Aside from the
 list, because neither of the two forges serves it with: GitHub makes it
 all at once in GraphQL, GitLab commit by commit (therefore bounded). Best-effort
 for the caller: without stats, only the +/− indicator is missing. */
  listPullRequestCommitExtras(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<Map<string, CommitExtras>>;
  /** The diff of ONE commit against its first parent, to the same types as the diff
 of the entire PR — the “what this commit changes” view. */
  getCommitDiff(opts: {
    token: string;
    repoFullName: string;
    sha: string;
  }): Promise<CommitDiff>;
  /** Base of the diff served: merge base ALIVE (GitHub, diff recalculated on the fly)
 or `diff_refs.base_sha` PERSISTED (GitLab, diff frozen at the last push). */
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
  /** Paths of the files named `fileName` under `roots` at `ref` (repository skills). */
  findFilesNamed(opts: {
    token: string;
    repoFullName: string;
    ref: string;
    roots: readonly string[];
    fileName: string;
  }): Promise<string[]>;
  /** Same bytes without UTF-8 decoding — the side-by-side view of the images in the diff. */
  getFileBytesAtRef(opts: {
    token: string;
    repoFullName: string;
    path: string;
    ref: string;
  }): Promise<ArrayBuffer | null>;
  mergePullRequest(opts: {
    token: string;
    repoFullName: string;
    number: number;
    /** Must belong to `mergeMethods` — valid caller, forge not inventing. */
    method?: MergeMethod;
    commitTitle?: string;
    commitMessage?: string;
  }): Promise<void>;
  updatePullRequestBranch(opts: {
    token: string;
    repoFullName: string;
    number: number;
    headSha?: string;
  }): Promise<void>;
  rerunPullRequestCheck(opts: {
    token: string;
    repoFullName: string;
    number: number;
    ref: CheckRerunRef;
  }): Promise<void>;
  updatePullRequestTitle(opts: {
    token: string;
    repoFullName: string;
    number: number;
    title: string;
  }): Promise<PullRequestRef>;
  /** Rewrite the PR description (the body of the thread card). */
  updatePullRequestBody(opts: {
    token: string;
    repoFullName: string;
    number: number;
    body: string;
  }): Promise<PullRequestRef>;
  enablePullRequestMergeFlow(opts: {
    token: string;
    repoFullName: string;
    number: number;
    nodeId?: string;
    method?: MergeMethod;
    queue: boolean;
    headSha?: string;
  }): Promise<void>;
  /** Withdraw the auto-merge (or the merge queue entry) of the PR. */
  disablePullRequestMergeFlow(opts: {
    token: string;
    repoFullName: string;
    number: number;
    nodeId?: string;
    queue: boolean;
  }): Promise<void>;
  /**
 * Submits a formal review. `published: "comment"` in return = the forge has
 * refused to publish the verdict (self-review) and it left in comment:
 * the caller must tell the user, and record the ACTUAL verdict of
 * his side. This is the normal case of Numo PR, not a degraded case.
 *
 * A text WITHOUT a verdict to make — the “comment” verdict, or the fallback
 * above — lands in the PR FEED at both providers, never
 * in a review event: this is the only place that `listPullRequestComments`
 * rereads, so the only one where minddy will be able to show it (see `submitPullRequestReview`).
 */
  submitReview(opts: {
    token: string;
    repoFullName: string;
    number: number;
    verdict: ReviewVerdict;
    body: string;
    locale?: string;
  }): Promise<ReviewSubmission>;
  /** Approval count, already reduced: the rule "last verdict by
 user" is a GitHub detail (GitLab maintains the current list), it
 does not have to go back to the callers. */
  listReviews(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<PullRequestReviewSummary>;
  /** CI checks. `number` AND `sha` are requested because the two forges
 do not address the same thing: GitHub queries the head COMMIT, GitLab
 the MR pipelines. Each implementation ignores the field that it
 does not use. */
  listChecks(opts: {
    token: string;
    repoFullName: string;
    number: number;
    sha: string;
    /** May still be pending: the check requests start without the policy,
        which only their summary needs. */
    requiredCheckNames?: readonly string[] | null | PromiseLike<readonly string[] | null>;
    checksRequired?: boolean | null | PromiseLike<boolean | null>;
  }): Promise<ChecksSummary>;
  /** Draft → ready for review. `nodeId` is only read by GitHub (key from
 GraphQL mutation); GitLab removes the `Draft:` prefix from the title. */
  markReadyForReview(opts: {
    token: string;
    repoFullName: string;
    number: number;
    nodeId?: string;
  }): Promise<void>;
  /** Open → draft. `nodeId` is required only by GitHub GraphQL. */
  convertToDraft(opts: {
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
  /**
 * PR ACTIVITY (MIN-159): everything that happened to it that is not
 * a message — reviews submitted (with their body), commits pushed, labels,
 * assignments, review requests, renames, draft ↔ ready, closing,
 * reopening, merge.
 *
 * Aside from comments, as with the two forges: GitHub serves a feed
 * of typed events (`issues/{n}/timeline`, including deployments), GitLab system notes in
 * English mixed with messages. The common vocabulary is
 * `lib/pr-timeline` — and the caller merges the two lists by date.
 *
 * Best-effort on the caller: without activity, the thread renders what it rendered
 * before, never an error.
 */
  listTimeline(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<PrTimelineEvent[]>;
  /** Deployment lifecycle of the PR head: settled (with its URL and
      duration), still running, or nothing usable to show. */
  getPullRequestDeployment(opts: {
    token: string;
    repoFullName: string;
    number: number;
    branch?: string;
    sha: string;
  }): Promise<DeploymentOutcome>;
  createPullRequestComment(opts: {
    token: string;
    repoFullName: string;
    number: number;
    body: string;
  }): Promise<PullRequestComment>;
  /**
   * Rewrites the body of a conversation comment. HUMAN gesture (see the
   * identity table below): it starts from the person's git account, like the
   * create. GitHub ignores `number` (the comment is addressed by its own id),
   * GitLab requires the MR iid — same arrangement as `createPullRequestComment`.
   * Returns the updated comment; its `updated_at`, when the forge carries one,
   * powers the "(edited)" marker.
   */
  updatePullRequestComment(opts: {
    token: string;
    repoFullName: string;
    number: number;
    commentId: number;
    body: string;
  }): Promise<PullRequestComment>;
  /**
 * The images pasted into the PR — its body, its feed, its line remarks —
 * indexed by asset ID, each under an ACTUALLY serverable URL
 * (MIN-162). This is what the markdown body doesn't give: the URL it carries
 * responds 404 to everything minddy holds. The detail is in
 * `lib/forge-image-assets` ; the `/image` route uses it to proxify.
 *
 * EMPTY table on the GitLab side, and this is an assumed lack, not an equivalence:
 * a GitLab note image is written `/uploads/<hash>/<fichier>`, a path
 * RELATED to the project — another mechanism, which no measure against a real
 * instance has confirmed here. An empty table makes the PR as it
 * was rendering before; inventing it would have made links dead.
 */
  /** Everything the PR carries in writing (reviews, conversation, line
      comments), as ticket mirrors (MIN-802), in no particular order. */
  listCommentMirrors(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<PrCommentMirror[]>;
  listImageAssets(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<Map<string, string>>;
  listPullRequestReviewComments(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<PullRequestReviewComment[]>;
  /** Anchor resolved BY the provider: hot-read PR header (GitHub) or
 diff_refs (GitLab). Line out of diff → error 422 (“lineNotInDiff”).
 `startLine`/`startSide` describe a RANGE (`line` is the last
 line): GitHub only honors them — on the GitLab side a note is anchored on a
 line, and the UI therefore only offers the range on GitHub (MIN-181). */
  createPullRequestReviewComment(opts: {
    token: string;
    repoFullName: string;
    number: number;
    body: string;
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
  /**
 * State of the review THREADS (MIN-139), apart from their comments because
 * the two forges serve it elsewhere: GraphQL on the GitHub side (the REST of the
 * comments ignores the existence of the thread), the already read discussions
 * on the GitLab side. The pairing is done by `rootCommentId`, the key of
 * `groupReviewThreads` — no caller has to know these paths.
 *
 * A caller who only reads the comments remains valid: the threads are
 * then in UNKNOWN state, and the UI does not offer anything rather than announcing
 * “open” without knowing it.
 */
  listReviewThreads(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<ReviewThreadState[]>;
  /** Resolves/reopens a thread. `threadId` comes from `listReviewThreads` and is
 readable only by the forge that issued it (GraphQL node id / discussion id). */
  setReviewThreadResolved(opts: {
    token: string;
    repoFullName: string;
    number: number;
    threadId: string;
    resolved: boolean;
  }): Promise<void>;
  /**
 * Emoji reactions of review comments (MIN-139), apart from them too:
 * GitHub renders them for the whole PR at once (GraphQL `reactionGroups`, with the
 * “have I already reacted” that the REST is silent), GitLab only notes by note.
 *
 * Hence `commentIds`, which **GitHub ignores**: it is GitLab which needs them, and
 * the caller already has them on hand since he has just read the comments.
 * Asking for them again avoids the GitLab implementation a third crossing
 * discussions.
 *
 * This is the only READING whose result depends on who is looking (MIN-145):
 * `mine` means “I, the connected human, reacted” on both sides. It does not read
 * in the data, it is deduced from the token that reads — hence
 * `viewerIsActor`, which the caller sets to false when it falls back on the installation token
 *. `mine` is then false everywhere: the “viewer” is the bot,
 * and lighting its chips would make everyone believe that they have performed a reaction that
 * no one has performed. The ACCOUNTS remain correct in both cases.
 */
  listReviewCommentReactions(opts: {
    token: string;
    repoFullName: string;
    number: number;
    commentIds: number[];
    /** Is the `token` above that of the human actor? Otherwise, `mine: false`. */
    viewerIsActor: boolean;
  }): Promise<ReviewCommentReaction[]>;
  /**
 * Place (`on`) or remove a reaction on ONE review comment — gesture
 * HUMAN, therefore the actor's token (see the identity table above).
 *
 * `login` is the account of this actor, and **GitLab ignores it**: withdrawal
 * GitHub must find THE reaction to delete among those of the comment
 * (REST does not know how to remove “mine”), where GitLab derives its own from the
 * token. Same arrangement as `commentIds`, which GitHub ignores.
 */
  setReviewCommentReaction(opts: {
    token: string;
    repoFullName: string;
    number: number;
    commentId: number;
    content: ReviewReactionContent;
    on: boolean;
    login: string | null;
  }): Promise<void>;
  /**
 * Conversation THREAD reactions (MIN-147): the body of the PR — sub
 * `PR_BODY_COMMENT_ID` — and all its comments. The exact counterpart of the two
 * review methods above, on the other surface: at GitHub a PR is
 * an issue, and neither its messages nor its body live where the
 * review comments live.
 *
 * On the GitLab side there is only one kind of note, and the awards are addressed to
 * the same: the two pairs are literally the same implementation.
 */
  listConversationReactions(opts: {
    token: string;
    repoFullName: string;
    number: number;
    commentIds: number[];
    viewerIsActor: boolean;
  }): Promise<ReviewCommentReaction[]>;
  setConversationReaction(opts: {
    token: string;
    repoFullName: string;
    number: number;
    commentId: number;
    content: ReviewReactionContent;
    on: boolean;
    login: string | null;
  }): Promise<void>;
}

type ForgeMethodName = {
  [K in keyof Forge]: Forge[K] extends (...args: never[]) => unknown ? K : never;
}[keyof Forge];

/**
 * Whether each `Forge` method only reads. A display request (GET) shares
 * concurrent identical reads (`withGithubReadScope`); a write never does.
 * The record is exhaustive, so a new method must be classified here.
 */
export const FORGE_METHOD_ACCESS = {
  requestPullRequestReviewer: "write",
  listRepoMembers: "read",
  listPullRequests: "read",
  getPullRequest: "read",
  getRepositoryMergePolicy: "read",
  listPullRequestFiles: "read",
  listPullRequestCommits: "read",
  compareCommits: "read",
  getBranchHeadSha: "read",
  listCommitPullRequestNumbers: "read",
  listPullRequestCommitExtras: "read",
  getCommitDiff: "read",
  getMergeBaseSha: "read",
  getFileAtRef: "read",
  findFilesNamed: "read",
  getFileBytesAtRef: "read",
  mergePullRequest: "write",
  updatePullRequestBranch: "write",
  rerunPullRequestCheck: "write",
  updatePullRequestTitle: "write",
  updatePullRequestBody: "write",
  enablePullRequestMergeFlow: "write",
  disablePullRequestMergeFlow: "write",
  submitReview: "write",
  listReviews: "read",
  listChecks: "read",
  markReadyForReview: "write",
  convertToDraft: "write",
  closePullRequest: "write",
  reopenPullRequest: "write",
  listPullRequestComments: "read",
  listTimeline: "read",
  getPullRequestDeployment: "read",
  createPullRequestComment: "write",
  updatePullRequestComment: "write",
  listCommentMirrors: "read",
  listImageAssets: "read",
  listPullRequestReviewComments: "read",
  createPullRequestReviewComment: "write",
  replyToPullRequestReviewComment: "write",
  listReviewThreads: "read",
  setReviewThreadResolved: "write",
  listReviewCommentReactions: "read",
  setReviewCommentReaction: "write",
  listConversationReactions: "read",
  setConversationReaction: "write",
} as const satisfies Record<ForgeMethodName, "read" | "write">;

export const FORGE_READ_METHODS = (Object.keys(FORGE_METHOD_ACCESS) as ForgeMethodName[])
  .filter((name) => FORGE_METHOD_ACCESS[name] === "read");

const githubForge: Forge = {
  provider: "github",
  mergeMethods: ["squash", "merge", "rebase"],
  reactionsNeedCommentIds: false,
  sharesConcurrentReads: true,
  identity: {
    accountTable: "git_user_identities",
    userAuthConfigured: () => isGithubUserAuthConfigured(),
    // Configuration, not identity: it does not depend on the reader or the
    // repository, and an unconfigured App must not break the PR view.
    botLogin: () => {
      try {
        return `${getGithubAppSlug()}[bot]`;
      } catch {
        return null;
      }
    },
  },
  listRepoMembers: github.listRepoMembers,
  requestPullRequestReviewer: github.requestPullRequestReviewer,
  listPullRequests: github.listPullRequests,
  getPullRequest: github.getPullRequest,
  getRepositoryMergePolicy: github.getRepositoryMergePolicy,
  listPullRequestFiles: github.listPullRequestFiles,
  listPullRequestCommits: github.listPullRequestCommits,
  compareCommits: github.compareCommits,
  getBranchHeadSha: github.getBranchHeadSha,
  listCommitPullRequestNumbers: github.listCommitPullRequestNumbers,
  listPullRequestCommitExtras: github.listPullRequestCommitExtras,
  getCommitDiff: github.getCommitDiff,
  getMergeBaseSha: github.getMergeBaseSha,
  getFileAtRef: github.getFileAtRef,
  findFilesNamed: github.findFilesNamed,
  getFileBytesAtRef: github.getFileBytesAtRef,
  mergePullRequest: github.mergePullRequest,
  updatePullRequestBranch: github.updatePullRequestBranch,
  rerunPullRequestCheck: github.rerunPullRequestCheck,
  updatePullRequestBody: github.updatePullRequestBody,
  updatePullRequestTitle: github.updatePullRequestTitle,
  disablePullRequestMergeFlow: github.disablePullRequestMergeFlow,
  enablePullRequestMergeFlow: github.enablePullRequestMergeFlow,
  submitReview: github.submitPullRequestReview,
  listReviews: github.listPullRequestReviews,
  listChecks: github.listPullRequestChecks,
  // The GraphQL mutation only addresses the PR by its `node_id`: without it (a PR
  // read by the *list* endpoint, which does not serve it), we refuse outright rather than
  // let GitHub respond to an opaque GraphQL error.
  markReadyForReview: async (opts) => {
    if (!opts.nodeId) {
      throw new GithubApiError("Pull request has no GraphQL id", 409);
    }
    return github.markPullRequestReadyForReview({ token: opts.token, nodeId: opts.nodeId });
  },
  convertToDraft: async (opts) => {
    if (!opts.nodeId) {
      throw new GithubApiError("Pull request has no GraphQL id", 409);
    }
    return github.convertPullRequestToDraft({ token: opts.token, nodeId: opts.nodeId });
  },
  closePullRequest: github.closePullRequest,
  reopenPullRequest: github.reopenPullRequest,
  listPullRequestComments: github.listPullRequestComments,
  listTimeline: github.listPullRequestTimeline,
  getPullRequestDeployment: github.getPullRequestDeployment,
  createPullRequestComment: github.createPullRequestComment,
  updatePullRequestComment: github.updatePullRequestComment,
  listCommentMirrors: async (opts) => {
    const sources = await github.listPullRequestMirrorSources(opts);
    return [
      ...sources.reviews.map((review) => mirrorFromGithubReview(review, "created")),
      ...sources.comments.map((comment) => mirrorFromGithubConversationComment(comment, "created")),
      ...sources.reviewComments.map((comment) => mirrorFromGithubReviewComment(comment, "created")),
    ].filter((mirror): mirror is PrCommentMirror => !!mirror);
  },
  listImageAssets: github.listPullRequestImageAssets,
  listPullRequestReviewComments: github.listPullRequestReviewComments,
  // GitHub requires `commit_id` = the HEAD of the PR, read on the spot with each sending
  // (between opening the view and sending, the agent was able to push — cf. pr.ts).
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
  listReviewThreads: github.listPullRequestReviewThreads,
  // The thread is addressed by its GraphQL node id, which alone carries the repository and
  // the PR: the interface triplet has nothing to do there.
  setReviewThreadResolved: (opts) =>
    github.setPullRequestReviewThreadResolved({
      token: opts.token,
      threadId: opts.threadId,
      resolved: opts.resolved,
    }),
  // The request starts from the PR: the comment ids are of no use to it.
  listReviewCommentReactions: github.listPullRequestReviewCommentReactions,
  setReviewCommentReaction: (opts) =>
    github.setPullRequestReviewCommentReaction({
      token: opts.token,
      repoFullName: opts.repoFullName,
      commentId: opts.commentId,
      content: opts.content,
      on: opts.on,
      login: opts.login,
    }),
  // A query for the entire thread, including the body: the ids are of no use to it.
  listConversationReactions: github.listPullRequestConversationReactions,
  setConversationReaction: github.setPullRequestConversationReaction,
};

const gitlabForge: Forge = {
  provider: "gitlab",
  // No `rebase`: GitLab sets the strategy at the project level, only the
  // squash is a parameter to the merge call.
  mergeMethods: ["squash", "merge"],
  reactionsNeedCommentIds: true,
  sharesConcurrentReads: false,
  identity: {
    accountTable: "git_connections",
    userAuthConfigured: () => isGitlabConfigured(),
    botLogin: () => null,
  },
  listRepoMembers: gitlab.listRepoMembers,
  requestPullRequestReviewer: gitlab.requestPullRequestReviewer,
  listPullRequests: gitlab.listPullRequests,
  getPullRequest: gitlab.getMergeRequest,
  getRepositoryMergePolicy: gitlab.getRepositoryMergePolicy,
  listPullRequestFiles: gitlab.listMergeRequestChanges,
  listPullRequestCommits: gitlab.listMergeRequestCommits,
  compareCommits: gitlab.compareCommits,
  getBranchHeadSha: gitlab.getBranchHeadSha,
  listCommitPullRequestNumbers: gitlab.listCommitPullRequestNumbers,
  listPullRequestCommitExtras: gitlab.listMergeRequestCommitExtras,
  getCommitDiff: gitlab.getCommitDiff,
  getMergeBaseSha: gitlab.getMergeBaseSha,
  getFileAtRef: gitlab.getFileAtRef,
  findFilesNamed: gitlab.findFilesNamed,
  getFileBytesAtRef: gitlab.getFileBytesAtRef,
  mergePullRequest: gitlab.mergeMergeRequest,
  updatePullRequestBranch: gitlab.rebaseMergeRequest,
  rerunPullRequestCheck: gitlab.rerunMergeRequestCheck,
  updatePullRequestBody: gitlab.updateMergeRequestBody,
  updatePullRequestTitle: gitlab.updateMergeRequestTitle,
  disablePullRequestMergeFlow: gitlab.disableMergeRequestAutoMerge,
  enablePullRequestMergeFlow: gitlab.enableMergeRequestAutoMerge,
  submitReview: gitlab.submitMergeRequestReview,
  listReviews: gitlab.listMergeRequestApprovals,
  listChecks: gitlab.listMergeRequestChecks,
  markReadyForReview: gitlab.markMergeRequestReadyForReview,
  convertToDraft: gitlab.convertMergeRequestToDraft,
  closePullRequest: gitlab.closeMergeRequest,
  reopenPullRequest: gitlab.reopenMergeRequest,
  listPullRequestComments: gitlab.listMergeRequestNotes,
  listTimeline: gitlab.listMergeRequestTimeline,
  getPullRequestDeployment: gitlab.getPullRequestDeployment,
  createPullRequestComment: gitlab.createMergeRequestNote,
  updatePullRequestComment: gitlab.updateMergeRequestNote,
  // See the `listImageAssets` doc: the GitLab image mechanism is a
  // path relative to the project, not a signed asset. Nothing measured, therefore nothing
  // invented — the MR returns as before.
  listImageAssets: async () => new Map<string, string>(),
  listCommentMirrors: async (opts) =>
    (await gitlab.listMergeRequestMirrorSources(opts))
      .map((note) => mirrorFromGitlabNote(note, "created"))
      .filter((mirror): mirror is PrCommentMirror => !!mirror),
  listPullRequestReviewComments: gitlab.listMergeRequestDiffComments,
  // `startLine`/`startSide` are left out, explicitly: a note
  // GitLab anchors to ONE line (`old_line`/`new_line`). Sneak them through
  // would lose them silently — the UI therefore does not offer the range on GitLab, and
  // this filter is the second guard (MIN-181).
  createPullRequestReviewComment: ({ startLine: _s, startSide: _ss, ...opts }) =>
    gitlab.createMergeRequestDiffComment(opts),
  replyToPullRequestReviewComment: gitlab.replyToMergeRequestDiffComment,
  listReviewThreads: gitlab.listMergeRequestDiffThreads,
  setReviewThreadResolved: gitlab.setMergeRequestDiscussionResolved,
  listReviewCommentReactions: gitlab.listMergeRequestNoteAwards,
  setReviewCommentReaction: gitlab.setMergeRequestNoteAward,
  // A note is a note: the conversation thread and the review go through the
  // SAME calls, `awardsUrl` doing the part of the MR body alone.
  listConversationReactions: gitlab.listMergeRequestNoteAwards,
  setConversationReaction: gitlab.setMergeRequestNoteAward,
};

/** Client of the provider — the value comes from `LinkedRepository.provider` (DB). */
export function forgeFor(provider: RepoProviderId): Forge {
  return provider === "gitlab" ? gitlabForge : githubForge;
}
