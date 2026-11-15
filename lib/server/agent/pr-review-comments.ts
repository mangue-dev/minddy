import "server-only";

import { NextResponse } from "next/server";
import {
  isReviewReactionContent,
  PR_BODY_COMMENT_ID,
  type ReviewReactionContent,
} from "@/lib/pr-review-reactions";
import { isForgeApiError } from "./forge";
import { forgeErrorResponse, MAX_COMMENT_BODY_LENGTH, MAX_PATH_LENGTH, requireActor } from "./pr-access";
import { recordPrActionEvent } from "./pr-action-events";
import { withForgeAttachmentPublication } from "./pr-attachments";
import { broadcastPrChanged } from "./pr-live";
import { actorCall, type PrScope } from "./pr-scope";
import { pullRequestIssueIds } from "./pull-requests";

/**
 * The review comments and their threads' resolution state (MIN-139), in one
 * round trip: the client needs both to render a thread.
 *
 * Threads are best-effort: a failure (GraphQL unavailable, unexpected GitLab
 * tier) returns `threads: []`, so the comments show and only the "Resolve"
 * action is missing.
 *
 * Only reactions are read under the person's account (MIN-145), since `mine`
 * depends on who is looking. Comments and threads stay on the installation
 * token, so every project member sees the review without a git account.
 */
export async function prReviewCommentsResponse(scope: PrScope): Promise<NextResponse> {
  try {
    const actorRead = scope.actor();
    const commentsRead = scope.forge.listPullRequestReviewComments(scope.call);
    // Best-effort, like threads: an unreadable reaction must not empty the
    // entire view.
    //
    // Without an actor we can still read counts; hiding them would suggest there
    // are no reactions. Use `viewerIsActor: false`, though, because the
    // installation token's “I reacted” state belongs to the bot, not the viewer.
    const readReactions = (commentIds: number[]) => actorRead.then((actor) => {
      const viewerIsActor = actor.kind === "actor";
      return scope.forge.listReviewCommentReactions({
        ...(viewerIsActor ? actorCall(actor, scope) : scope.call),
        commentIds,
        viewerIsActor,
      });
    }).catch(() => {
      console.error("[pr-actions] review_reactions_unreadable");
      return [];
    });
    // A forge that needs the comment ids waits for them, and a PR without a
    // review then costs nothing; the other starts at once (MIN-889).
    const reactionsRead = scope.forge.reactionsNeedCommentIds
      ? commentsRead.then((comments) => comments.length ? readReactions(comments.map((c) => c.id)) : [])
      : readReactions([]);
    const [comments, threads, , reactions] = await Promise.all([
      commentsRead,
      scope.forge.listReviewThreads(scope.call).catch(() => {
        console.error("[pr-actions] review_threads_unreadable");
        return [];
      }),
      actorRead,
      reactionsRead,
    ]);
    return NextResponse.json({ comments, threads, reactions });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

/**
 * Validates a thread resolution PATCH. `thread_id` is an OPAQUE identifier
 * interpolated into a URL (GitLab) or a GraphQL variable (GitHub). As with
 * `in_reply_to`, constrain it to the character sets used by both forges
 * (GitLab hexadecimal IDs and GitHub node IDs) instead of trusting the type.
 * This also rejects `..`.
 */
export function parseReviewThreadPayload(
  raw: unknown,
): { ok: true; payload: { threadId: string; resolved: boolean } } | { ok: false; response: NextResponse } {
  const p = (raw ?? {}) as { thread_id?: unknown; resolved?: unknown };
  const bad = (error: string) => ({
    ok: false as const,
    response: NextResponse.json({ error }, { status: 400 }),
  });

  if (typeof p.thread_id !== "string" || !/^[A-Za-z0-9_=-]{1,255}$/.test(p.thread_id)) {
    return bad("Invalid thread_id");
  }
  if (typeof p.resolved !== "boolean") return bad("Invalid resolved");
  return { ok: true, payload: { threadId: p.thread_id, resolved: p.resolved } };
}

export async function setPrReviewThreadResolvedResponse(
  scope: PrScope,
  payload: { threadId: string; resolved: boolean },
): Promise<NextResponse> {
  // A write to the repository, signed by the person: under the bot, threads
  // showed `resolvedBy: "minddy-app[bot]"` (MIN-139).
  const actor = await requireActor(scope, "write");
  if (!actor.ok) return actor.response;
  try {
    await scope.forge.setReviewThreadResolved({
      ...actorCall(actor.actor, scope),
      ...payload,
    });
    broadcastPrChanged(scope.pr.id, ["reviewComments"]);
    return NextResponse.json({ ok: true, resolved: payload.resolved });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

/**
 * Validates a reaction POST (MIN-139). `comment_id` is interpolated into a
 * forge URL, so like `in_reply_to` it must be a real integer. `content` is one
 * of the eight canonical reactions.
 *
 * `allowBody` (MIN-147) also accepts `0`, `PR_BODY_COMMENT_ID`, the PR body.
 * Off by default: a review comment always has a real id.
 */
export function parseReactionPayload(
  raw: unknown,
  opts?: { allowBody?: boolean },
):
  | { ok: true; payload: { commentId: number; content: ReviewReactionContent; on: boolean } }
  | { ok: false; response: NextResponse } {
  const p = (raw ?? {}) as { comment_id?: unknown; content?: unknown; on?: unknown };
  const bad = (error: string) => ({
    ok: false as const,
    response: NextResponse.json({ error }, { status: 400 }),
  });

  // `isSafeInteger`, not `isInteger`: 1e300 is an integer for the latter and
  // would land in the forge URL in exponential notation.
  if (
    typeof p.comment_id !== "number" ||
    !Number.isSafeInteger(p.comment_id) ||
    p.comment_id < (opts?.allowBody ? PR_BODY_COMMENT_ID : 1)
  ) {
    return bad("Invalid comment_id");
  }
  if (!isReviewReactionContent(p.content)) return bad("Invalid content");
  if (typeof p.on !== "boolean") return bad("Invalid on");
  return { ok: true, payload: { commentId: p.comment_id, content: p.content, on: p.on } };
}

export async function setPrReviewCommentReactionResponse(
  scope: PrScope,
  payload: { commentId: number; content: ReviewReactionContent; on: boolean },
): Promise<NextResponse> {
  // `read`, not merely connected (MIN-145): removing a reaction rereads the
  // comment's reactions with this token to find the person's own.
  const actor = await requireActor(scope, "read");
  if (!actor.ok) return actor.response;
  try {
    await scope.forge.setReviewCommentReaction({
      ...actorCall(actor.actor, scope),
      ...payload,
      login: actor.actor.login,
    });
    // GitHub sends no webhook for reactions: this broadcast is the only way
    // other readers learn of it.
    broadcastPrChanged(scope.pr.id, ["reviewComments"]);
    return NextResponse.json({ ok: true, on: payload.on });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

export interface ReviewCommentPayload {
  body: string;
  path?: string;
  line?: number;
  side?: "LEFT" | "RIGHT";
  /** First line of a multi-line remark — `line` is then the last. */
  startLine?: number;
  startSide?: "LEFT" | "RIGHT";
  inReplyTo?: number;
}

/**
 * Validates a review comment POST: either a reply in a thread
 * (`in_reply_to`) or an anchor (`path`, `line`, `side`).
 *
 * `in_reply_to` must be a real integer: it is interpolated into the forge URL,
 * where a string could slip in `..` (which `fetch` normalizes) and escape
 * `/repos/{owner}/{repo}/…`, while the installation token covers the whole
 * installation, not this one repository.
 */
export function parseReviewCommentPayload(
  raw: unknown,
): { ok: true; payload: ReviewCommentPayload } | { ok: false; response: NextResponse } {
  const p = (raw ?? {}) as {
    body?: unknown;
    path?: unknown;
    line?: unknown;
    side?: unknown;
    start_line?: unknown;
    start_side?: unknown;
    in_reply_to?: unknown;
  };
  const bad = (error: string) => ({
    ok: false as const,
    response: NextResponse.json({ error }, { status: 400 }),
  });

  const body =
    typeof p.body === "string" ? p.body.trim().slice(0, MAX_COMMENT_BODY_LENGTH) : "";
  if (!body) return bad("Comment required");

  if (p.in_reply_to != null) {
    // `isSafeInteger`, as for `comment_id`: a huge integer would land in the
    // forge URL in exponential notation.
    if (
      typeof p.in_reply_to !== "number" ||
      !Number.isSafeInteger(p.in_reply_to) ||
      p.in_reply_to < 1
    ) {
      return bad("Invalid in_reply_to");
    }
    return { ok: true, payload: { body, inReplyTo: p.in_reply_to } };
  }

  if (typeof p.path !== "string" || !p.path || p.path.length > MAX_PATH_LENGTH) {
    return bad("Path required");
  }
  if (typeof p.line !== "number" || !Number.isSafeInteger(p.line) || p.line < 1) {
    return bad("Line required");
  }
  if (p.side !== "LEFT" && p.side !== "RIGHT") return bad("Invalid side");

  // Range (MIN-181): optional, but when present it must be a real range. The
  // forge refuses `start_line >= line` with an error that does not say so.
  if (p.start_line == null) {
    return { ok: true, payload: { body, path: p.path, line: p.line, side: p.side } };
  }
  if (
    typeof p.start_line !== "number" ||
    !Number.isSafeInteger(p.start_line) ||
    p.start_line < 1 ||
    p.start_line >= p.line
  ) {
    return bad("Invalid start_line");
  }
  const startSide = p.start_side ?? p.side;
  if (startSide !== "LEFT" && startSide !== "RIGHT") return bad("Invalid start_side");
  return {
    ok: true,
    payload: {
      body,
      path: p.path,
      line: p.line,
      side: p.side,
      startLine: p.start_line,
      startSide,
    },
  };
}

export async function createPrReviewCommentResponse(
  scope: PrScope,
  payload: ReviewCommentPayload,
  userId: string,
): Promise<NextResponse> {
  // Require `read`, not merely “connected”: on GitHub,
  // `createPullRequestReviewComment` rereads the current PR for its `commitId`
  // using this token. An account unable to read the repository would fail there.
  const actor = await requireActor(scope, "read");
  if (!actor.ok) return actor.response;
  const call = actorCall(actor.actor, scope);
  /** Trace a posted remark from either path (thread reply or new anchor):
      broadcast it to PR viewers, then record “commented on PR code” on the
      ticket. Review comments are grouped because one activity line per remark
      would overwhelm the ticket journal. */
  const trace = async () => {
    broadcastPrChanged(scope.pr.id, ["reviewComments"]);
    for (const issueId of await pullRequestIssueIds(scope.pr.id)) {
      await recordPrActionEvent(
        issueId,
        userId,
        "pr_code_commented",
        scope.pr.number,
        scope.target.provider,
      );
    }
  };
  try {
    if (payload.inReplyTo != null) {
      const commentId = payload.inReplyTo;
      const comment = await withForgeAttachmentPublication(scope.pr.id, payload.body,
        () => scope.forge.replyToPullRequestReviewComment({
        ...call,
        commentId,
        body: payload.body,
      }));
      await trace();
      return NextResponse.json({ comment });
    }
    // The provider resolves the anchor (the live PR head on GitHub, diff_refs
    // on GitLab): the caller reads nothing first.
    const comment = await withForgeAttachmentPublication(scope.pr.id, payload.body,
      () => scope.forge.createPullRequestReviewComment({
      ...call,
      body: payload.body,
      path: payload.path as string,
      line: payload.line as number,
      side: payload.side as "LEFT" | "RIGHT",
      startLine: payload.startLine,
      startSide: payload.startSide,
    }));
    await trace();
    return NextResponse.json({ comment });
  } catch (err) {
    if (isForgeApiError(err) && err.status === 422) {
      // 422: the forge refuses to anchor the line, usually a line outside the
      // diff, sometimes a head that moved under the user. A dedicated code lets
      // the UI explain it and keep the typed text, where a generic 502 would
      // look like an outage.
      return NextResponse.json({ error: err.message, code: "lineNotInDiff" }, { status: 422 });
    }
    return forgeErrorResponse(err);
  }
}
