import "server-only";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { commentStore, readSyncedForgeComment } from "@/lib/server/comment-store";
import { issueStore } from "@/lib/server/issue-store";
import {
  mirrorFromGithubConversationComment,
  mirrorFromGithubReviewComment,
  mirrorFromGitlabNote,
  parseMirroredRemoteId,
  parseThreadKey,
  type PrCommentMirror,
} from "@/lib/pr-comment-mirror";
import {
  createPrCommentResponse,
  createPrReviewCommentResponse,
  resolvePrScope,
} from "./pr-actions";
import { syncPrCommentToIssues } from "./pr-comment-sync";
import { findPullRequest } from "./pull-requests";

const MAX_REPLY_LENGTH = 65_536;

/** The comment as both forges' create/reply calls return it (mapped shapes). */
interface PostedForgeComment {
  id: number;
  body?: string;
  user?: { login?: string } | null;
  created_at?: string;
  updated_at?: string | null;
  html_url?: string;
  in_reply_to_id?: number | null;
  path?: string;
  line?: number | null;
  diff_hunk?: string;
}

/**
 * The first lines of the answered comment, as a markdown quote. A GitHub
 * conversation has no threads: the quote is how GitHub itself shows what a
 * comment answers (“Quote reply”).
 */
export function quoteForReply(original: string, reply: string): string {
  const lines = original.split("\n").map((line) => line.trimEnd()).filter(Boolean);
  if (lines.length === 0) return reply;
  const kept = lines.slice(0, 3).map((line) => `> ${line}`);
  if (lines.length > 3) kept.push(">", "> …");
  return `${kept.join("\n")}\n\n${reply}`;
}

/**
 * Answers, from a ticket, a comment mirrored from its pull request (MIN-802):
 * the answer is POSTED ON THE FORGE, under the person's own git account and
 * with the same rules as the PR view (`resolvePrScope` + `canWrite`), then
 * mirrored back at once — the webhook echo only rewrites the same copy, and a
 * setup without webhooks still shows the answer.
 *
 * - A code thread, or any GitLab discussion, receives a real thread reply.
 * - A GitHub conversation comment or review message has no thread on GitHub:
 *   the answer is a new conversation comment that quotes it, and the ticket
 *   threads it under the comment it answers.
 */
export async function forgeReplyResponse(opts: {
  userId: string;
  supabase: SupabaseClient;
  issueId: string;
  commentId: string;
  body: unknown;
}): Promise<NextResponse> {
  const t = await getTranslations("ApiErrors");
  const text = typeof opts.body === "string" ? opts.body.trim() : "";
  if (!text || text.length > MAX_REPLY_LENGTH) {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const notFound = () => NextResponse.json({ error: t("commentNotFound") }, { status: 404 });

  // The ticket must be visible to the caller: their own client, under RLS.
  const { data: issue } = await issueStore(opts.supabase).select("id")
    .eq("id", opts.issueId).is("deleted_at", null).maybeSingle();
  if (!issue) return notFound();

  const service = getServiceClient();
  const origin = await readSyncedForgeComment(service, {
    issueId: opts.issueId,
    commentId: opts.commentId,
  });
  const remote = origin ? parseMirroredRemoteId(origin.remoteCommentId) : null;
  if (!origin?.pullRequestId || !remote) return notFound();
  const pr = await findPullRequest(origin.pullRequestId);
  if (!pr) return notFound();
  const scope = await resolvePrScope(opts.userId, pr);
  if (!scope) return notFound();
  if (!scope.canWrite) {
    return NextResponse.json({ error: t("readOnlyProject"), code: "readOnlyProject" }, { status: 403 });
  }

  const threaded = remote.kind === "code" || remote.provider === "gitlab";
  let response: NextResponse;
  if (threaded) {
    response = await createPrReviewCommentResponse(scope, { body: text, inReplyTo: remote.forgeId }, opts.userId);
  } else {
    const { data: original } = await commentStore(service, "comments").select("body")
      .eq("id", opts.commentId).eq("issue_id", opts.issueId).maybeSingle();
    response = await createPrCommentResponse(
      scope,
      quoteForReply((original?.body as string | undefined) ?? "", text),
      opts.userId,
      opts.supabase,
    );
  }
  if (!response.ok) return response;

  const posted = ((await response.clone().json()) as { comment?: PostedForgeComment }).comment;
  const mirror = posted ? mirrorOfReply(posted, remote, origin) : null;
  if (mirror) {
    await syncPrCommentToIssues({
      provider: origin.provider,
      repoFullName: pr.repo_full_name,
      prNumber: pr.number,
      mirror: { ...mirror, replyToRemoteCommentId: origin.remoteCommentId },
    });
  }
  return response;
}

function mirrorOfReply(
  posted: PostedForgeComment,
  remote: NonNullable<ReturnType<typeof parseMirroredRemoteId>>,
  origin: { threadKey: string | null },
): PrCommentMirror | null {
  const user = { login: posted.user?.login ?? null, type: "User" };
  if (remote.provider === "gitlab") {
    const thread = parseThreadKey(origin.threadKey);
    return mirrorFromGitlabNote({
      id: posted.id,
      body: posted.body,
      type: remote.kind === "code" ? "DiffNote" : null,
      authorLogin: user.login,
      url: posted.html_url,
      created_at: posted.created_at,
      updated_at: posted.updated_at,
      discussionId: thread && "discussionId" in thread ? thread.discussionId : null,
    }, "created");
  }
  if (remote.kind === "code") {
    return mirrorFromGithubReviewComment({ ...posted, user }, "created");
  }
  return mirrorFromGithubConversationComment({ ...posted, user }, "created");
}
