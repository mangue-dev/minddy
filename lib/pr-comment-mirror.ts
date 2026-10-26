/**
 * PURE rules of the PR → ticket comment mirror (MIN-802), shared by the
 * webhook receivers, the link-time import and the ticket timeline.
 *
 * A pull request carries written words in several shapes. On GitHub, three
 * endpoints with three id spaces:
 * - conversation comments (`issue_comment`, `issues/{n}/comments`);
 * - code comments anchored to a diff line (`pull_request_review_comment`,
 *   `pulls/{n}/comments`), threaded through `in_reply_to_id`;
 * - review summaries (`pull_request_review`, `pulls/{n}/reviews`).
 * On GitLab, notes grouped in discussions, anchored to the diff (`DiffNote`)
 * or not.
 *
 * They all land in the ticket through the forge-comment sidecar
 * (`github_issue_comment_syncs`, named after its first use). The remote id is
 * therefore NAMESPACED here so two objects never share a key: a GitHub
 * conversation comment keeps its bare id (it IS an issue comment), the others
 * get a prefix that also says whether the comment is about code.
 *
 * Threads: `threadKey` names the forge thread — the GitHub review-thread root,
 * the GitLab discussion. The first comment of a thread to land in a ticket is
 * its root there; the others become replies under it.
 *
 * Who lands: humans only in the conversation and in review summaries (a bot's
 * status report is noise on a ticket); bots too on code, because a line
 * comment from a review bot is a precise remark about this code.
 *
 * The code anchor (and, on GitHub, the excerpt) is written INTO the body of a
 * thread root, as markdown: every reader of the comment (Numo, MCP clients, a
 * copied prompt) then knows which code the remark is about. The timeline
 * recognizes that header on mirrored code comments and renders it like the PR
 * view does (`parseMirroredCodeComment`).
 */

import { normalizeForgeInstant } from "@/lib/forge-time";
import { hunkPatch, hunkPreview } from "@/lib/pr-diff-hunk";

export type PrCommentMirrorAction = "created" | "edited" | "deleted";
export type MirrorForge = "github" | "gitlab";

/** One PR comment, ready to be written to every ticket linked to its PR. */
export interface PrCommentMirror {
  provider: MirrorForge;
  /** Namespaced sidecar key (see the module comment). */
  remoteCommentId: string;
  /** Forge thread the comment belongs to, or null for a standalone comment. */
  threadKey: string | null;
  /**
   * Sidecar key of the comment this one answers, when minddy itself posted the
   * answer from a ticket: a GitHub conversation comment has no forge thread
   * that would say so.
   */
  replyToRemoteCommentId?: string | null;
  action: PrCommentMirrorAction;
  /** The comment text — the whole body of a reply. */
  body: string;
  /** Code anchor and excerpt, written above `body` when the comment lands as a thread root. */
  codeHeader: string | null;
  authorLogin: string | null;
  authorAssociation: string | null;
  htmlUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** A GitHub account, as both webhook payloads and REST responses serve it. */
interface GithubUser {
  login?: string | null;
  type?: string | null;
}

/** Fields shared by conversation and code comments (webhook and REST). */
export interface GithubPrCommentSource {
  id?: number | null;
  body?: string | null;
  user?: GithubUser | null;
  author_association?: string | null;
  html_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** A code comment: the shared fields plus its diff anchor. */
export interface GithubPrReviewCommentSource extends GithubPrCommentSource {
  path?: string | null;
  line?: number | null;
  original_line?: number | null;
  start_line?: number | null;
  original_start_line?: number | null;
  side?: string | null;
  start_side?: string | null;
  diff_hunk?: string | null;
  in_reply_to_id?: number | null;
}

/** A review summary. GitHub serves no `updated_at` for reviews. */
export interface GithubPrReviewSource {
  id?: number | null;
  body?: string | null;
  state?: string | null;
  user?: GithubUser | null;
  author_association?: string | null;
  html_url?: string | null;
  submitted_at?: string | null;
}

/** A GitLab diff position, as notes and Note Hooks carry it. */
interface GitlabPosition {
  old_path?: string | null;
  new_path?: string | null;
  old_line?: number | null;
  new_line?: number | null;
}

/**
 * A GitLab note, normalized by the caller from a Note Hook (`object_attributes`
 * plus the hook's `user`) or a REST discussion (`notes[]`).
 */
export interface GitlabNoteSource {
  id?: number | null;
  body?: string | null;
  system?: boolean | null;
  /** `DiffNote` for a note anchored to the diff. */
  type?: string | null;
  position?: GitlabPosition | null;
  original_position?: GitlabPosition | null;
  authorLogin?: string | null;
  url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  discussionId?: string | null;
}

export const reviewCommentRemoteId = (id: number) => `review_comment:${id}`;
export const reviewRemoteId = (id: number) => `review:${id}`;
export const gitlabNoteRemoteId = (id: number, onCode: boolean) =>
  `${onCode ? "gitlab_diff_note" : "gitlab_note"}:${id}`;
export const gitlabThreadKey = (discussionId: string) => `gitlab_discussion:${discussionId}`;

/** A sidecar key, read back: its forge, its number at the forge and whether it is about code. */
export interface MirroredRemoteId {
  provider: MirrorForge;
  kind: "conversation" | "code" | "review";
  /** The id the forge APIs take (comment or note id). */
  forgeId: number;
}

export function parseMirroredRemoteId(remoteCommentId: string): MirroredRemoteId | null {
  const match = /^(?:(review_comment|review|gitlab_diff_note|gitlab_note):)?(\d+)$/.exec(remoteCommentId);
  if (!match) return null;
  const forgeId = Number(match[2]);
  if (!Number.isSafeInteger(forgeId)) return null;
  switch (match[1]) {
    case "review_comment":
      return { provider: "github", kind: "code", forgeId };
    case "review":
      return { provider: "github", kind: "review", forgeId };
    case "gitlab_diff_note":
      return { provider: "gitlab", kind: "code", forgeId };
    case "gitlab_note":
      return { provider: "gitlab", kind: "conversation", forgeId };
    default:
      return { provider: "github", kind: "conversation", forgeId };
  }
}

/**
 * The forge thread a thread key names: the GitHub review-thread ROOT comment,
 * or the GitLab discussion — the two keys `ReviewThreadState` pairs on.
 */
export function parseThreadKey(
  threadKey: string | null | undefined,
): { rootCommentId: number } | { discussionId: string } | null {
  if (!threadKey) return null;
  const github = /^review_comment:(\d+)$/.exec(threadKey);
  if (github) return { rootCommentId: Number(github[1]) };
  const gitlab = /^gitlab_discussion:(.+)$/.exec(threadKey);
  return gitlab ? { discussionId: gitlab[1] } : null;
}

/**
 * A forge instant as an ISO string. GitLab hooks write `2026-10-20 10:00:00
 * UTC`, which `Date` does not read; zone-less values count as UTC and future
 * skew is clamped (`normalizeForgeInstant`). The ticket shows the comment at
 * the time it was WRITTEN, however late it is imported.
 */
export function forgeTimestamp(value: unknown): string | null {
  // A forge timestamp is short; anything longer is not one.
  if (typeof value !== "string" || value.length > 64) return null;
  let iso = value.trim().replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, "$1T$2");
  // A suffix check, not `\s*UTC$`: that pattern backtracks on long runs of spaces.
  if (iso.toUpperCase().endsWith("UTC")) iso = `${iso.slice(0, -3).trimEnd()}Z`;
  return normalizeForgeInstant(iso)?.toISOString() ?? null;
}

const isGithubBot = (user: GithubUser | null | undefined) => user?.type === "Bot";

/**
 * GitLab serves no account type in notes or hooks. Its machine accounts follow
 * fixed naming: project and group access-token bots, and service accounts.
 */
export function isGitlabBotLogin(login: string | null | undefined): boolean {
  return !!login && /^(?:(?:project|group)_\d+_bot(?:_[0-9a-f]+)?|service_account_.+)$/i.test(login);
}

const hasText = (body: string | null | undefined) => !!body && body.trim().length > 0;

function githubFields(source: GithubPrCommentSource) {
  return {
    provider: "github" as const,
    authorLogin: source.user?.login ?? null,
    authorAssociation: source.author_association ?? null,
    htmlUrl: source.html_url ?? null,
    createdAt: forgeTimestamp(source.created_at),
    updatedAt: forgeTimestamp(source.updated_at),
  };
}

/**
 * A GitHub conversation comment, or null when it does not belong on a ticket:
 * a bot wrote it, or it carries no text. A deletion is kept whatever its body
 * — the mirrored copy must still learn that it is gone.
 */
export function mirrorFromGithubConversationComment(
  comment: GithubPrCommentSource | null | undefined,
  action: PrCommentMirrorAction,
): PrCommentMirror | null {
  if (comment?.id == null || isGithubBot(comment.user)) return null;
  if (action !== "deleted" && !hasText(comment.body)) return null;
  return {
    remoteCommentId: String(comment.id),
    threadKey: null,
    action,
    body: comment.body ?? "",
    codeHeader: null,
    ...githubFields(comment),
  };
}

/**
 * A GitHub code comment, bots included, with its code excerpt. GitHub threads
 * are flat: every reply names the first comment, which is the thread key.
 */
export function mirrorFromGithubReviewComment(
  comment: GithubPrReviewCommentSource | null | undefined,
  action: PrCommentMirrorAction,
): PrCommentMirror | null {
  if (comment?.id == null) return null;
  if (action !== "deleted" && !hasText(comment.body)) return null;
  return {
    remoteCommentId: reviewCommentRemoteId(comment.id),
    threadKey: reviewCommentRemoteId(comment.in_reply_to_id ?? comment.id),
    action,
    body: comment.body ?? "",
    codeHeader: formatGithubCodeHeader(comment),
    ...githubFields(comment),
  };
}

/**
 * A GitHub review summary. Only its WRITTEN part lands: a bare approval says
 * nothing to read, and the activity line already records the verdict. Pending
 * reviews are private to their author on GitHub, so they never land either.
 *
 * GitHub dates a review once (`submitted_at`): an edit is dated by `now`, the
 * delivery time, so it wins over the copy it rewrites.
 */
export function mirrorFromGithubReview(
  review: GithubPrReviewSource | null | undefined,
  action: "created" | "edited",
  now: string = new Date().toISOString(),
): PrCommentMirror | null {
  if (review?.id == null || isGithubBot(review.user)) return null;
  if (review.state?.toUpperCase() === "PENDING" || !hasText(review.body)) return null;
  const submittedAt = forgeTimestamp(review.submitted_at);
  return {
    provider: "github",
    remoteCommentId: reviewRemoteId(review.id),
    threadKey: null,
    action,
    body: review.body ?? "",
    codeHeader: null,
    authorLogin: review.user?.login ?? null,
    authorAssociation: review.author_association ?? null,
    htmlUrl: review.html_url ?? null,
    createdAt: submittedAt,
    updatedAt: action === "edited" ? now : submittedAt,
  };
}

/**
 * A GitLab note. System notes (“added 2 commits”, “approved this merge
 * request”) are activity, not comments, and never land. Bot conversation stays
 * on GitLab like on GitHub; diff notes land whoever wrote them.
 *
 * GitLab serves no diff excerpt for a note: a code comment carries its file and
 * line, like the merge request view shows it.
 */
export function mirrorFromGitlabNote(
  note: GitlabNoteSource | null | undefined,
  action: PrCommentMirrorAction,
): PrCommentMirror | null {
  if (note?.id == null || note.system) return null;
  const onCode = note.type === "DiffNote";
  if (!onCode && isGitlabBotLogin(note.authorLogin)) return null;
  if (action !== "deleted" && !hasText(note.body)) return null;
  const position = note.position ?? note.original_position;
  const line = position?.new_line ?? position?.old_line ?? null;
  return {
    provider: "gitlab",
    remoteCommentId: gitlabNoteRemoteId(note.id, onCode),
    threadKey: note.discussionId ? gitlabThreadKey(note.discussionId) : null,
    action,
    body: note.body ?? "",
    codeHeader: onCode ? codeAnchor(position?.new_path ?? position?.old_path ?? "", line, null) : null,
    authorLogin: note.authorLogin ?? null,
    authorAssociation: null,
    htmlUrl: note.url ?? null,
    createdAt: forgeTimestamp(note.created_at),
    updatedAt: forgeTimestamp(note.updated_at),
  };
}

/** The ticket body of a mirrored comment, depending on where it lands in its thread. */
export function mirroredCommentBody(mirror: PrCommentMirror, asReply: boolean): string {
  if (asReply || !mirror.codeHeader) return mirror.body;
  return [mirror.codeHeader, mirror.body].filter(Boolean).join("\n\n");
}

/** A fence longer than any backtick run of the content, so code never closes it. */
function fenceFor(content: string): string {
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

/** `` `path:12` `` or `` `path:10-12` ``; null for a path inline code cannot hold. */
function codeAnchor(path: string, line: number | null, startLine: number | null | undefined): string | null {
  // A path no forge would serve, but which would break the inline code.
  if (!path || /[`\n]/.test(path)) return null;
  const range = line == null
    ? ""
    : startLine != null && startLine < line ? `:${startLine}-${line}` : `:${line}`;
  return `\`${path}${range}\``;
}

/**
 * The header of a GitHub code comment root: the anchor, then the excerpt
 * GitHub shows above the comment.
 *
 * ```
 * `lib/plan.ts:40-42`
 *
 * ```diff
 * @@ -38,3 +38,4 @@
 *  context
 * +added
 * ```
 * ```
 *
 * `path:line` is the notation every reader understands, in every locale. The
 * excerpt is the one `PrHunk` renders in the PR view (`hunkPatch`), its `@@`
 * header recomputed on the kept lines. An outdated comment has lost `line`:
 * its original anchor still names the code it was written about.
 */
export function formatGithubCodeHeader(comment: GithubPrReviewCommentSource): string | null {
  const path = comment.path ?? "";
  const line = comment.line ?? comment.original_line ?? null;
  const startLine = comment.line != null ? comment.start_line : comment.original_start_line;
  const anchor = codeAnchor(path, line, startLine);
  if (!anchor) return null;

  const patch = hunkPatch(
    path,
    comment.diff_hunk ?? "",
    undefined,
    line != null && startLine != null && startLine < line
      ? {
          startLine,
          endLine: line,
          side: (comment.start_side ?? comment.side) === "LEFT" ? "LEFT" : "RIGHT",
        }
      : undefined,
  );
  // Drop the `diff --git` / `---` / `+++` lines: the anchor already names the file.
  const hunk = patch.split("\n").slice(3).join("\n").trimEnd();
  if (!hunk) return anchor;
  const fence = fenceFor(hunk);
  return `${anchor}\n\n${fence}diff\n${hunk}\n${fence}`;
}

/** A mirrored code comment, split back into its excerpt and its text. */
export interface MirroredCodeComment {
  path: string;
  line: number | null;
  startLine: number | null;
  /** Side the line numbers count on, read back from the excerpt itself. */
  side: "LEFT" | "RIGHT";
  /** The `@@` header and its lines — what `PrHunk` takes as `diffHunk`; null on GitLab. */
  diffHunk: string | null;
  /** The comment text, without the header. */
  body: string;
}

const CODE_HEADER = /^`([^`\n]+?)(?::(\d+)(?:-(\d+))?)?`(?:\n\n(`{3,})diff\n(@@[^\n]*(?:\n[^\n]*)*?)\n\4)?(?:\n|$)/;

/**
 * The reverse of the header written above a mirrored code comment, or null
 * when the body does not start with one. Only call it for a comment whose
 * sidecar key says it is about code (`parseMirroredRemoteId`): those bodies
 * are written by the mirror and edited by nobody in minddy, so an opening
 * inline code IS the anchor.
 */
export function parseMirroredCodeComment(body: string): MirroredCodeComment | null {
  const match = CODE_HEADER.exec(body);
  if (!match) return null;
  const [whole, path, first, second, , diffHunk] = match;
  const line = second != null ? Number(second) : first != null ? Number(first) : null;
  const startLine = second != null ? Number(first) : null;
  // The format does not spell the side out: a range whose numbers are not on
  // the head side of the excerpt was written about removed lines.
  const newLines = new Set(hunkPreview(diffHunk ?? "", 0).map((l) => l.newLine));
  const side =
    diffHunk && line != null && (!newLines.has(line) || (startLine != null && !newLines.has(startLine)))
      ? "LEFT"
      : "RIGHT";
  return {
    path,
    line,
    startLine,
    side,
    diffHunk: diffHunk ?? null,
    body: body.slice(whole.length).replace(/^\n+/, ""),
  };
}
