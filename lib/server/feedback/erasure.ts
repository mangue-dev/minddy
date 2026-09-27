import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeFeedbackIdentityRow } from "./identity-content";

/**
 * Erase a board participant's private identity (GDPR Article 17).
 *
 * The board owner handles erasure requests from participants. The identity row
 * remains under an opaque UUID and pseudonym so that existing contributions,
 * replies, and votes retain their meaning. Email, name, external ID, pending
 * verification codes, and sessions are removed atomically by the database.
 *
 * Every call revokes sessions, including retries after an earlier erasure.
 */

export interface FeedbackErasureReport {
  userId: string;
  /** Identity data was already erased before this call. */
  alreadyErased: boolean;
  /** Contributions that remain available under the pseudonym. */
  posts: number;
  comments: number;
  votes: number;
  /** Sessions revoked by this call. */
  sessions: number;
}

export type FeedbackErasureResult =
  | { ok: true; report: FeedbackErasureReport }
  | { ok: false; error: "notFound" | "failed" };

export async function eraseFeedbackUser(params: {
  projectId: string;
  userId: string;
}): Promise<FeedbackErasureResult> {
  const service = getServiceClient();

  // Scope both the read and the transactional erasure to this project.
  const { data: user, error: readError } = await service
    .from("feedback_users")
    .select("id, project_id, email, erased_at")
    .eq("id", params.userId)
    .eq("project_id", params.projectId)
    .maybeSingle();
  if (readError) return { ok: false, error: "failed" };
  if (!user) return { ok: false, error: "notFound" };

  let posts: number;
  let comments: number;
  let votes: number;
  try {
    [posts, comments, votes] = await Promise.all([
      countRows(service, "feedback_posts", "author_id", params.userId),
      countRows(service, "comments", "feedback_user_id", params.userId),
      countRows(service, "feedback_votes", "user_id", params.userId),
    ]);
  } catch {
    return { ok: false, error: "failed" };
  }

  let email: string | null = null;
  if (!user.erased_at) {
    try {
      // Legacy OTP rows can lack a blind lookup during rollout, so the clear
      // email is required to remove them. If decryption fails, keep the
      // identity intact and report failure instead of a partial erasure.
      email = (await decodeFeedbackIdentityRow(user, params.projectId)).email;
    } catch {
      return { ok: false, error: "failed" };
    }
  }
  const { data, error } = await service.rpc("erase_feedback_identity", {
    p_project_id: params.projectId,
    p_user_id: params.userId,
    p_email_plain: email,
  });
  const result = (data as { already_erased: boolean;
    sessions_revoked: number }[] | null)?.[0];
  if (error || !result) {
    console.error("[feedback-erasure] atomic erase failed");
    return { ok: false, error: "failed" };
  }

  return {
    ok: true,
    report: {
      userId: params.userId,
      alreadyErased: result.already_erased,
      posts,
      comments,
      votes,
      sessions: result.sessions_revoked,
    },
  };
}

/** Votes use the post/identity pair as their primary key, so count all rows. */
async function countRows(
  service: ReturnType<typeof getServiceClient>,
  table: string,
  column: string,
  userId: string
): Promise<number> {
  const { count, error } = await service
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, userId);
  if (error || count === null) throw new Error("Feedback contribution count failed");
  return count;
}
