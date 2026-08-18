import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/server/cron-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { runFeedbackReview } from "@/lib/server/feedback/review";
import { getAppConfigValue } from "@/lib/server/app-config";

/**
 * Cron horaire (Vercel Cron, vercel.json) : passe de revue IA du feedback
 * (MIN-87 — deduplication + categorization + moderation in one call), purge of
 * pranks ruled out, and cleaning of expired sessions/OTPs. Since MIN-87 the review
 * is mainly triggered on submission (`after()`): this cron is the NET OF
 * SECURITY (LLM down at time of post, AI budget returned since, backfill).
 * Vercel automatically sends `Authorization: Bearer ${CRON_SECRET}` when the
 * variable is configured; the road is unusable without this secret.
 */

export const maxDuration = 300;

const DEFAULT_JUNK_PURGE_DAYS = 30;
const PURGE_BATCH = 200;

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const review = await runFeedbackReview();

  const service = getServiceClient();
  const purged = await purgeJunk();

  // Housekeeping: OTP codes expired for more than a day, expired sessions.
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const now = new Date().toISOString();
  await Promise.all([
    service.from("feedback_otp_codes").delete().lt("expires_at", dayAgo),
    service.from("feedback_sessions").delete().lt("expires_at", now),
  ]);

  return NextResponse.json({ ok: true, review, purged });
}

/**
 * Permanent removal of pranks (MIN-87). A post removed by moderation
 * does not have to drag on indefinitely, but we ONLY delete what no one
 * seized: no linked issue, no support beyond the voice of its
 * author, and past the retention period (the team can republish it until then).
 * All dependencies cascade (votes, comments, events,
 * notifications, attachments).
 */
async function purgeJunk(): Promise<number> {
  const days = Number.parseFloat(
    (await getAppConfigValue("feedback_junk_purge_days")) ?? ""
  );
  const retention = Number.isFinite(days) ? days : DEFAULT_JUNK_PURGE_DAYS;
  if (retention <= 0) return 0;

  const cutoff = new Date(Date.now() - retention * 24 * 3600 * 1000).toISOString();
  const service = getServiceClient();
  const { data: candidates, error: pickError } = await service
    .from("feedback_posts")
    .select("id")
    .is("deleted_at", null)
    .eq("status", "spam")
    .is("issue_id", null)
    .is("merged_into_id", null)
    .lte("vote_count", 1)
    .lt("created_at", cutoff)
    .limit(PURGE_BATCH);
  if (pickError) {
    console.error("[feedback-cron] junk purge scan failed:", pickError.message);
    return 0;
  }
  const ids = (candidates ?? []).map((p) => p.id as string);
  if (ids.length === 0) return 0;

  // A spam post may have absorbed duplicates (mergers before the
  // moderation). Deleting it would reset its tombstones to `merged_into_id`
  // null — they would be resurrected as standalone posts on the board. We keep it.
  const { data: absorbers } = await service
    .from("feedback_posts")
    .select("merged_into_id")
    .is("deleted_at", null)
    .in("merged_into_id", ids);
  const referenced = new Set(
    (absorbers ?? []).map((p) => p.merged_into_id as string)
  );
  const deletable = ids.filter((id) => !referenced.has(id));
  if (deletable.length === 0) return 0;

  const { data, error } = await service
    .from("feedback_posts")
    .delete()
    .is("deleted_at", null)
    .in("id", deletable)
    .select("id");
  if (error) {
    console.error("[feedback-cron] junk purge failed:", error.message);
    return 0;
  }
  return (data ?? []).length;
}
