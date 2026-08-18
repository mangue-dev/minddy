import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who can edit or delete a feedback comment (MIN-196).
 *
 * Taken from the route to being REACHABLE: This is a permission rule, the only one of all feedback that decides who can remove something from a public page
 *, and a rule such must be able to be exercised directly rather than reread.
 *
 * Feedback is RLS deny-all: unlike ticket comments, including
 * the rule "author only, never those of Numo" is carried by Postgres policies
 * Postgres, this only exists here. The caller has already proven membership in the
 * project; what is decided there is the rest.
 *
 * **Delete a comment PUBLIC is open to the whole team**, regardless of who
 * is the author — a visitor, a colleague, Numo via respond_feedback, or
 * person (team responses taken over by the migration do not have an author).
 * The rule follows where the words are, not the hand that typed them: they
 * are on a page that the team publishes on its behalf. Reserved for the author, it
 * left an abusive comment online until his return, made the response of a colleague who had left irretrievable, and left the migrated responses —
 * without an author by construction — deletable by anyone.
 *
 * **Editing remains with the author.** Rewriting another's words under one's name is
 * not moderation; those of a VISITOR are never rewritten, by
 * anyone. Correcting a typo in your own published response, however,
 * remains permitted.
 *
 * INTERNAL notes keep the original rule on both sides: a peer-to-peer conversation is not a publication.
 */
export type FeedbackCommentGuard = { ok: true } | { ok: false; status: number };

export async function guardFeedbackComment(
  service: SupabaseClient,
  params: {
    postId: string;
    commentId: string;
    userId: string;
    /** `delete` opens team moderation; `edit` remains with the author. */
    mode: "edit" | "delete";
  }
): Promise<FeedbackCommentGuard> {
  const { data } = await service
    .from("comments")
    .select("id, author_id, via_assistant, feedback_post_id, feedback_user_id, visibility")
    .eq("id", params.commentId)
    .maybeSingle();
  // Absent, or attached to ANOTHER return: invisible rather than forbidden.
  if (!data || data.feedback_post_id !== params.postId) {
    return { ok: false, status: 404 };
  }

  if (params.mode === "delete" && data.visibility === "public") return { ok: true };
  // A visitor's words are not rewritten, even by the team.
  if (data.feedback_user_id !== null) return { ok: false, status: 403 };
  // Not the author, or a comment from Numo → not yours to touch.
  if (data.author_id !== params.userId || data.via_assistant) {
    return { ok: false, status: 403 };
  }
  return { ok: true };
}
