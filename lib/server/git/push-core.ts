/**
 * A forge push, read into one shape (MIN-1037). Pure and without I/O: the two
 * receivers normalize their payload here, then hand the same object to the
 * ingestion (`commit-ingest.ts`).
 *
 * Both forges deliver a push as a ref that moved from `before` to `after`,
 * with the commits it brought. They differ on the rest: GitHub says whether
 * the push was forced and caps the list at 2,048 commits without a total;
 * GitLab caps it at 20 and gives `total_commits_count`.
 */

const BRANCH_PREFIX = "refs/heads/";
const ZERO_SHA = /^0+$/;

/** GitHub documents this as the most commits a push payload carries. */
export const GITHUB_PUSH_COMMIT_LIMIT = 2048;

/** A commit, as a push payload or the forge API describes it. */
export interface PushCommit {
  sha: string;
  /** Full message: the first line is the title. */
  message: string;
  /** Forge login of the author, when the forge resolved one. */
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  /** Name written in the commit. */
  authorName: string | null;
  /** Email written in the commit: only tells the author from its co-signers. */
  authorEmail: string | null;
  committedAt: string | null;
}

export interface NormalizedPush {
  /** Branch that moved, or null for a tag or any other ref. */
  branch: string | null;
  /** Null when the push created the branch. */
  before: string | null;
  /** Null when the push deleted the branch. */
  after: string | null;
  created: boolean;
  deleted: boolean;
  forced: boolean;
  defaultBranch: string | null;
  onDefaultBranch: boolean;
  /** Oldest first, as both forges deliver them. */
  commits: PushCommit[];
  /** The payload does not carry every commit of the push. */
  truncated: boolean;
  /** The account that pushed. */
  pusher: { accountId: string | null; login: string | null; avatarUrl: string | null };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function sha(value: unknown): string | null {
  const read = text(value);
  return read && !ZERO_SHA.test(read) ? read : null;
}

function accountId(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return text(value);
}

function branchOf(ref: unknown): string | null {
  const read = text(ref);
  return read?.startsWith(BRANCH_PREFIX) ? read.slice(BRANCH_PREFIX.length) || null : null;
}

/** First line of a commit message: what a list shows. */
export function commitTitle(message: string): string {
  return message.split(/\r?\n/, 1)[0]?.trim() ?? "";
}

interface GithubPushCommit {
  id?: unknown;
  message?: unknown;
  timestamp?: unknown;
  author?: { name?: unknown; email?: unknown; username?: unknown } | null;
}

interface GithubPushPayload {
  ref?: unknown;
  before?: unknown;
  after?: unknown;
  created?: unknown;
  deleted?: unknown;
  forced?: unknown;
  commits?: GithubPushCommit[] | null;
  repository?: { default_branch?: unknown } | null;
  sender?: { id?: unknown; login?: unknown; avatar_url?: unknown } | null;
}

/** A GitHub `push` event, or null when the payload names no ref. */
export function normalizeGithubPush(payload: unknown): NormalizedPush | null {
  const push = (payload ?? {}) as GithubPushPayload;
  if (!text(push.ref)) return null;
  const branch = branchOf(push.ref);
  const defaultBranch = text(push.repository?.default_branch);
  const senderLogin = text(push.sender?.login);
  const senderAvatar = text(push.sender?.avatar_url);
  const commits = (Array.isArray(push.commits) ? push.commits : []).flatMap(
    (commit): PushCommit[] => {
      const id = sha(commit?.id);
      if (!id) return [];
      const login = text(commit.author?.username);
      return [{
        sha: id,
        message: text(commit.message) ?? "",
        authorLogin: login,
        // The payload carries one avatar: the sender's.
        authorAvatarUrl: login && login === senderLogin ? senderAvatar : null,
        authorName: text(commit.author?.name),
        authorEmail: text(commit.author?.email)?.toLowerCase() ?? null,
        committedAt: text(commit.timestamp),
      }];
    },
  );
  const before = sha(push.before);
  const after = sha(push.after);
  return {
    branch,
    before,
    after,
    created: push.created === true || (!before && !!after),
    deleted: push.deleted === true || !after,
    forced: push.forced === true,
    defaultBranch,
    onDefaultBranch: !!branch && branch === defaultBranch,
    commits,
    truncated: commits.length >= GITHUB_PUSH_COMMIT_LIMIT,
    pusher: {
      accountId: accountId(push.sender?.id),
      login: senderLogin,
      avatarUrl: senderAvatar,
    },
  };
}

interface GitlabPushCommit {
  id?: unknown;
  message?: unknown;
  title?: unknown;
  timestamp?: unknown;
  author?: { name?: unknown; email?: unknown } | null;
}

interface GitlabPushPayload {
  object_kind?: unknown;
  ref?: unknown;
  before?: unknown;
  after?: unknown;
  user_id?: unknown;
  user_username?: unknown;
  user_email?: unknown;
  user_avatar?: unknown;
  total_commits_count?: unknown;
  commits?: GitlabPushCommit[] | null;
  project?: { default_branch?: unknown } | null;
}

/**
 * A GitLab `Push Hook`, or null when the payload names no ref.
 *
 * GitLab names the author of a commit by name and email only. The pusher's
 * account is attached to the commits written under the pusher's email, which
 * is the common case of a person pushing their own work.
 */
export function normalizeGitlabPush(payload: unknown): NormalizedPush | null {
  const push = (payload ?? {}) as GitlabPushPayload;
  if (!text(push.ref)) return null;
  const branch = branchOf(push.ref);
  const defaultBranch = text(push.project?.default_branch);
  const pusherLogin = text(push.user_username);
  const pusherEmail = text(push.user_email)?.toLowerCase() ?? null;
  const pusherAvatar = text(push.user_avatar);
  const commits = (Array.isArray(push.commits) ? push.commits : []).flatMap(
    (commit): PushCommit[] => {
      const id = sha(commit?.id);
      if (!id) return [];
      const email = text(commit.author?.email)?.toLowerCase() ?? null;
      const own = !!pusherEmail && email === pusherEmail;
      return [{
        sha: id,
        message: text(commit.message) ?? text(commit.title) ?? "",
        authorLogin: own ? pusherLogin : null,
        authorAvatarUrl: own ? pusherAvatar : null,
        authorName: text(commit.author?.name),
        authorEmail: email,
        committedAt: text(commit.timestamp),
      }];
    },
  );
  const total = typeof push.total_commits_count === "number" ? push.total_commits_count : null;
  const before = sha(push.before);
  const after = sha(push.after);
  return {
    branch,
    before,
    after,
    created: !before && !!after,
    deleted: !after,
    // GitLab does not say whether a push rewrote the branch.
    forced: false,
    defaultBranch,
    onDefaultBranch: !!branch && branch === defaultBranch,
    commits,
    truncated: total != null && total > commits.length,
    pusher: {
      accountId: accountId(push.user_id),
      login: pusherLogin,
      avatarUrl: pusherAvatar,
    },
  };
}
