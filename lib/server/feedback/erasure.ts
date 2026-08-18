import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getBoardForProject } from "@/lib/server/feedback/boards";

/**
 * Deletion of a board participant (GDPR art. 17).
 *
 * The board editor is responsible for processing the people who participate in it; minddy is his subcontractor. When a deletion request to him
 * arrives, it is therefore up to him to execute it — and until now he had nothing to do: no identity deletion existed in the product.
 *
 * What leaves: email, name, external_id, verification codes in wait,
 * and all open sessions. What remains: the line, opaque, bearing a
 * uuid and the pseudonym that derives from it. The WHY of this choice is at length in
 * the migration `20261110090000_feedback_erasure.sql` — in one sentence: delete
 * the line would change the public comments of the person to those of
 * the team, would take away the responses of others, and would change
 * retroactively the weight of the feedback that she had supported.
 *
 * Idempotent: erasing the same identity twice does nothing the second time
 * and gives the same report.
 */

export interface FeedbackErasureReport {
  userId: string;
  /** Already deleted before this call — nothing has been retouched. */
  alreadyErased: boolean;
  /** Contributions remaining online, now without identifiable author. */
  posts: number;
  comments: number;
  votes: number;
  /** Sessions revoked (visitor is logged out everywhere). */
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

  // `project_id` is part of the filter, not just the read: route
  // carries a project id and an identity id, and nothing
  // would otherwise prohibit erasing the identity of a neighboring board.
  const { data: user } = await service
    .from("feedback_users")
    .select("id, project_id, email, erased_at")
    .eq("id", params.userId)
    .eq("project_id", params.projectId)
    .maybeSingle();
  if (!user) return { ok: false, error: "notFound" };

  const [posts, comments, votes] = await Promise.all([
    countRows(service, "feedback_posts", "author_id", params.userId),
    countRows(service, "comments", "feedback_user_id", params.userId),
    countRows(service, "feedback_votes", "user_id", params.userId),
  ]);

  if (user.erased_at) {
    return {
      ok: true,
      report: {
        userId: params.userId,
        alreadyErased: true,
        posts,
        comments,
        votes,
        sessions: 0,
      },
    };
  }

  // Sessions first: as long as the cookie is valid, its bearer would continue to
  // see yourself “connected” under an identity that you are emptying.
  const { count: sessions } = await service
    .from("feedback_sessions")
    .delete({ count: "exact" })
    .eq("user_id", params.userId);

  // A pending code carries the address in plain text. It expires in ten minutes and the
  // night sweep picks it up — but “in ten minutes” is not a
  // response to a deletion request.
  if (user.email) {
    const board = await getBoardForProject(params.projectId);
    if (board) {
      await service
        .from("feedback_otp_codes")
        .delete()
        .eq("board_id", board.id)
        .eq("email", user.email);
    }
  }

  const { error } = await service
    .from("feedback_users")
    .update({
      email: null,
      name: null,
      external_id: null,
      erased_at: new Date().toISOString(),
    })
    .eq("id", params.userId);
  if (error) {
    console.error("[feedback-erasure] scrub failed:", error.message);
    return { ok: false, error: "failed" };
  }

  return {
    ok: true,
    report: {
      userId: params.userId,
      alreadyErased: false,
      posts,
      comments,
      votes,
      sessions: sessions ?? 0,
    },
  };
}

/** `select("*")` and not `select("id")`: `feedback_votes` does not have a column
 `id` (its primary key is the post/identity pair), and an absent column
 causes the count to fail instead of returning zero. */
async function countRows(
  service: ReturnType<typeof getServiceClient>,
  table: string,
  column: string,
  userId: string
): Promise<number> {
  const { count } = await service
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, userId);
  return count ?? 0;
}
